import { ensureDir } from "@std/fs";
import { dirname, join, normalize, relative } from "@std/path";
import { TarStream, type TarStreamInput, UntarStream } from "@std/tar";

interface ArchiveEntry {
  readonly sourcePath: string;
  readonly archivePath: string;
  readonly size: number;
}

export async function createSourceArchive(outputPath: string) {
  await ensureDir(dirname(outputPath));

  const entries = [
    ...(await collectEntries("src")),
    await createArchiveEntry("deno.json"),
    await createArchiveEntry("deno.lock"),
  ];

  const archiveEntries = await Promise.all(entries.map(openArchiveEntry));

  const file = await Deno.open(outputPath, {
    create: true,
    mode: 0o640,
    truncate: true,
    write: true,
  });
  const gzipStream = new CompressionStream("gzip");
  await Promise.all([
    ReadableStream.from(archiveEntries)
      .pipeThrough(new TarStream())
      .pipeTo(gzipStream.writable),
    gzipStream.readable.pipeTo(file.writable),
  ]);
  await Deno.chmod(outputPath, 0o640);
}

export async function extractSourceArchive(
  archivePath: string,
  outputDir: string,
) {
  await ensureDir(outputDir);

  const file = await Deno.open(archivePath, { read: true });
  const gzipStream = new DecompressionStream("gzip");
  const entries = file.readable
    .pipeThrough(gzipStream)
    .pipeThrough(new UntarStream());

  for await (const entry of entries) {
    const outputPath = safeOutputPath(outputDir, entry.path);

    if (entry.readable === undefined && entry.header.typeflag === "5") {
      await ensureDir(outputPath);
      continue;
    }

    if (entry.readable === undefined) {
      throw new Error(`Unsupported archive entry: ${entry.path}`);
    }

    await ensureDir(dirname(outputPath));
    await entry.readable.pipeTo((await Deno.create(outputPath)).writable);
  }
}

async function collectEntries(root: string): Promise<ArchiveEntry[]> {
  const entries: ArchiveEntry[] = [];

  for await (const entry of walkFiles(root)) {
    entries.push({
      ...(await createArchiveEntry(entry)),
    });
  }

  return entries.sort((a, b) => a.archivePath.localeCompare(b.archivePath));
}

async function* walkFiles(path: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(path)) {
    const entryPath = join(path, entry.name);

    if (entry.isDirectory) {
      yield* walkFiles(entryPath);
    } else if (entry.isFile) {
      yield entryPath;
    }
  }
}

async function createArchiveEntry(sourcePath: string): Promise<ArchiveEntry> {
  return {
    sourcePath,
    archivePath: relative(".", sourcePath),
    size: (await Deno.stat(sourcePath)).size,
  };
}

async function openArchiveEntry(entry: ArchiveEntry): Promise<TarStreamInput> {
  return {
    type: "file",
    path: entry.archivePath,
    size: entry.size,
    readable: (await Deno.open(entry.sourcePath)).readable,
  };
}

function safeOutputPath(outputDir: string, archivePath: string) {
  if (archivePath.startsWith("/") || archivePath.includes("..")) {
    throw new Error(`Unsafe archive path: ${archivePath}`);
  }

  const outputPath = normalize(join(outputDir, archivePath));
  const normalizedOutputDir = normalize(outputDir);

  if (
    outputPath !== normalizedOutputDir &&
    !outputPath.startsWith(`${normalizedOutputDir}/`)
  ) {
    throw new Error(`Unsafe archive path: ${archivePath}`);
  }

  return outputPath;
}
