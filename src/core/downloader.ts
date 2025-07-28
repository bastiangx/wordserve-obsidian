import { requestUrl, Notice } from "obsidian";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import * as os from "os";
import { logger } from "../utils/logger";
import * as fflate from "fflate";

export const GITHUB_REPO = "bastiangx/wordserve";
export const TARGET_RELEASE_VERSION = "v0.1.2-beta";
export const BINARY_NAME = "wordserve";

interface PlatformInfo {
  os: string;
  arch: string;
  extension: string;
}

interface DownloadResult {
  success: boolean;
  error?: string;
}

export class WordServeDownloader {
  readonly basePath: string;
  private platformInfo: PlatformInfo;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.platformInfo = this.detectPlatform();
  }

  private detectPlatform(): PlatformInfo {
    const platform = os.platform();
    const arch = os.arch();

    let osName: string;
    let mappedArch: string;
    let extension: string;

    switch (platform) {
      case "darwin":
        osName = "Darwin";
        extension = ".tar.gz";
        break;
      case "linux":
        osName = "Linux";
        extension = ".tar.gz";
        break;
      case "win32":
        osName = "Windows";
        extension = ".zip";
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
    switch (arch) {
      case "x64":
        mappedArch = "x86_64";
        break;
      case "arm64":
        mappedArch = "arm64";
        break;
      default:
        throw new Error(`Unsupported architecture: ${arch}`);
    }

    return { os: osName, arch: mappedArch, extension };
  }

  private getAssetUrls() {
    const baseUrl = `https://github.com/${GITHUB_REPO}/releases/download/${TARGET_RELEASE_VERSION}`;
    const binaryAsset = `${BINARY_NAME}_${this.platformInfo.os}_${this.platformInfo.arch}${this.platformInfo.extension}`;

    return {
      binary: `${baseUrl}/${binaryAsset}`,
      data: `${baseUrl}/data.zip`,
      checksums: `${baseUrl}/checksums.txt`,
    };
  }

  private async downloadAsset(
    url: string,
    description: string
  ): Promise<ArrayBuffer> {
    try {
      logger.debug(`Downloading ${description} from ${url}`);
      new Notice(`Downloading ${description}...`);

      const response = await requestUrl({
        url,
        method: "GET",
      });

      if (response.status !== 200) {
        throw new Error(
          `HTTP ${response.status}: Failed to download ${description}`
        );
      }

      const arrayBuffer = response.arrayBuffer;
      const sizeInMB = arrayBuffer.byteLength / (1024 * 1024);

      if (sizeInMB > 10) {
        logger.debug(
          `Downloaded large file: ${description} (${sizeInMB.toFixed(1)}MB)`
        );
      }

      if (sizeInMB > 100) {
        logger.warn(
          `Very large download: ${description} is ${sizeInMB.toFixed(
            1
          )}MB - may impact performance`
        );
        // TODO: For very large files?, should do streaming, tho not likely ever
      }
      return arrayBuffer;
    } catch (error) {
      const errorMsg = `Failed to download ${description}: ${error.message}`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  private async verifyChecksum(
    data: ArrayBuffer,
    expectedHash: string,
    filename: string
  ): Promise<boolean> {
    const hash = crypto.createHash("sha256");
    hash.update(Buffer.from(data));
    const actualHash = hash.digest("hex");

    if (actualHash !== expectedHash) {
      const errorMsg = `Checksum verification failed for ${filename}. Expected: ${expectedHash}, Got: ${actualHash}`;
      logger.error(errorMsg);
      new Notice(`Security Error: Checksum mismatch for ${filename}`, 10000);
      return false;
    }

    logger.debug(`Checksum verified for ${filename}: ${actualHash}`);
    return true;
  }

  private parseChecksums(checksumsContent: string): Map<string, string> {
    const checksums = new Map<string, string>();
    const lines = checksumsContent.trim().split("\n");

    for (const line of lines) {
      const match = line.match(/^([a-f0-9]{64})\s+(.+)$/);
      if (match) {
        checksums.set(match[2], match[1]);
      }
    }

    return checksums;
  }

  private async extractArchive(archiveData: ArrayBuffer): Promise<void> {
    if (this.platformInfo.extension === ".tar.gz") {
      return this.extractTarGz(archiveData);
    } else if (this.platformInfo.extension === ".zip") {
      return this.extractZipArchive(archiveData);
    }
    throw new Error(
      `Unsupported archive format: ${this.platformInfo.extension}`
    );
  }

  private async extractTarGz(data: ArrayBuffer): Promise<void> {
    const tempExtractDir = path.join(
      this.basePath,
      `extract_${crypto.randomBytes(8).toString("hex")}`
    );

    try {
      await fs.promises.mkdir(tempExtractDir, { recursive: true });

      // Decompress gzip first
      const gzipData = new Uint8Array(data);
      const tarData = fflate.gunzipSync(gzipData);

      // Parse tar manually (simplified tar parsing for binary extraction)
      const binaryFilename =
        BINARY_NAME + (os.platform() === "win32" ? ".exe" : "");
      const extractedBinaryPath = await this.extractBinaryFromTar(
        tarData,
        tempExtractDir,
        binaryFilename
      );

      if (!extractedBinaryPath) {
        throw new Error(
          `Binary ${binaryFilename} not found in extracted archive`
        );
      }

      const targetBinaryPath = path.join(this.basePath, binaryFilename);
      await fs.promises.copyFile(extractedBinaryPath, targetBinaryPath);
      if (os.platform() !== "win32") {
        await fs.promises.chmod(targetBinaryPath, 0o755);
      }

      await fs.promises.rm(tempExtractDir, { recursive: true, force: true });
    } catch (error) {
      try {
        await fs.promises.rm(tempExtractDir, { recursive: true, force: true });
      } catch { }
      throw error;
    }
  }

  private async extractZipArchive(data: ArrayBuffer): Promise<void> {
    const tempExtractDir = path.join(
      this.basePath,
      `extract_${crypto.randomBytes(8).toString("hex")}`
    );

    try {
      await fs.promises.mkdir(tempExtractDir, { recursive: true });

      const zipData = new Uint8Array(data);
      const unzipped = fflate.unzipSync(zipData);

      const binaryFilename =
        BINARY_NAME + (os.platform() === "win32" ? ".exe" : "");
      let binaryFound = false;

      for (const [filename, fileData] of Object.entries(unzipped)) {
        if (
          filename.endsWith(binaryFilename) ||
          path.basename(filename) === binaryFilename
        ) {
          const targetBinaryPath = path.join(this.basePath, binaryFilename);
          await fs.promises.writeFile(targetBinaryPath, fileData);
          if (os.platform() !== "win32") {
            await fs.promises.chmod(targetBinaryPath, 0o755);
          }
          binaryFound = true;
          break;
        }
      }

      if (!binaryFound) {
        throw new Error(
          `Binary ${binaryFilename} not found in extracted archive`
        );
      }

      await fs.promises.rm(tempExtractDir, { recursive: true, force: true });
    } catch (error) {
      try {
        await fs.promises.rm(tempExtractDir, { recursive: true, force: true });
      } catch { }
      throw error;
    }
  }

  private async extractBinaryFromTar(
    tarData: Uint8Array,
    extractDir: string,
    binaryFilename: string
  ): Promise<string | null> {
    let offset = 0;

    while (offset < tarData.length) {
      if (offset + 512 > tarData.length) break;

      const header = tarData.slice(offset, offset + 512);
      const nameBytes = header.slice(0, 100);
      const name = new TextDecoder().decode(nameBytes).replace(/\0.*/, "");

      if (!name) break;

      const sizeBytes = header.slice(124, 136);
      const sizeStr = new TextDecoder()
        .decode(sizeBytes)
        .replace(/\0.*/, "")
        .replace(/\s/g, "");
      const size = parseInt(sizeStr, 8) || 0;

      offset += 512;

      if (
        name.endsWith(binaryFilename) ||
        path.basename(name) === binaryFilename
      ) {
        const fileData = tarData.slice(offset, offset + size);
        const extractedPath = path.join(extractDir, binaryFilename);
        await fs.promises.writeFile(extractedPath, fileData);
        return extractedPath;
      }
      offset += Math.ceil(size / 512) * 512;
    }

    return null;
  }

  private async extractZip(
    zipData: ArrayBuffer,
    outputDir: string
  ): Promise<void> {
    try {
      await fs.promises.mkdir(outputDir, { recursive: true });

      const zipBytes = new Uint8Array(zipData);
      const unzipped = fflate.unzipSync(zipBytes);

      for (const [filename, fileData] of Object.entries(unzipped)) {
        if (filename.endsWith(".bin")) {
          const outputPath = path.join(outputDir, path.basename(filename));
          await fs.promises.writeFile(outputPath, fileData);
          logger.debug(`Extracted ${filename} to ${outputPath}`);
        }
      }
    } catch (error) {
      throw new Error(`Failed to extract ZIP file: ${error.message}`);
    }
  }

  private async checkExistingInstallation(): Promise<boolean> {
    try {
      const binaryPath = path.join(
        this.basePath,
        BINARY_NAME + (os.platform() === "win32" ? ".exe" : "")
      );
      const dataDir = path.join(this.basePath, "data");

      await fs.promises.access(binaryPath, fs.constants.F_OK);
      await fs.promises.access(dataDir, fs.constants.F_OK);

      logger.debug("Existing WordServe installation found");
      return true;
    } catch {
      return false;
    }
  }

  public async downloadAndInstall(): Promise<DownloadResult> {
    try {
      if (await this.checkExistingInstallation()) {
        logger.info(
          "WordServe data already exist, skipping download"
        );
        return { success: true };
      }

      await fs.promises.mkdir(this.basePath, { recursive: true });
      const urls = this.getAssetUrls();

      const checksumsData = await this.downloadAsset(
        urls.checksums,
        "checksums"
      );
      const checksumsText = new TextDecoder().decode(checksumsData);
      const checksums = this.parseChecksums(checksumsText);

      const binaryFilename = path.basename(urls.binary);
      const dataFilename = "data.zip";

      const binaryExpectedHash = checksums.get(binaryFilename);
      const dataExpectedHash = checksums.get(dataFilename);

      if (!binaryExpectedHash) {
        throw new Error(
          `Missing checksum for ${binaryFilename} in checksums.txt`
        );
      }

      // NOTE: data.zip is an extra file not included in GoReleaser checksums
      // We'll skip checksum verification for it if not present
      const skipDataChecksum = !dataExpectedHash;
      if (skipDataChecksum) {
        logger.warn(
          `No checksum found for ${dataFilename} - skipping verification (extra file)`
        );
      }
      const binaryData = await this.downloadAsset(
        urls.binary,
        "WordServe binary"
      );
      const binaryHashValid = await this.verifyChecksum(
        binaryData,
        binaryExpectedHash,
        binaryFilename
      );
      if (!binaryHashValid) {
        throw new Error(
          "Binary checksum verification failed - installation aborted for security"
        );
      }
      await this.extractArchive(binaryData);
      const dataData = await this.downloadAsset(urls.data, "data files");

      if (!skipDataChecksum) {
        const dataHashValid = await this.verifyChecksum(
          dataData,
          dataExpectedHash,
          dataFilename
        );
        if (!dataHashValid) {
          throw new Error(
            "Data checksum verification failed - installation aborted for security"
          );
        }
      } else {
        logger.info(
          `Skipping checksum verification for ${dataFilename} (no checksum available)`
        );
      }
      const dataDir = path.join(this.basePath, "data");
      await fs.promises.mkdir(dataDir, { recursive: true });
      await this.extractZip(dataData, dataDir);

      new Notice("WordServe setup complete!");
      logger.info(
        "WordServe binary and data successfully downloaded and installed"
      );
      return { success: true };
    } catch (error) {
      let specificError: string;

      if (error.message.includes("Failed to download")) {
        specificError = `Network error during download: ${error.message}`;
      } else if (error.message.includes("Checksum verification failed")) {
        specificError = `Security verification failed: ${error.message}`;
      } else if (error.message.includes("not found in extracted archive")) {
        specificError = `Archive extraction error: ${error.message}`;
      } else if (error.message.includes("Missing checksum")) {
        specificError = `Checksum file parsing error: ${error.message}`;
      } else if (error.message.includes("Failed to extract")) {
        specificError = `Archive extraction failed: ${error.message}`;
      } else if (error.message.includes("Invalid gzip")) {
        specificError = `Archive extraction failed: Corrupted or invalid archive format`;
      } else {
        specificError = error.message;
      }
      const errorMsg = `Failed to download/install WordServe: ${specificError}`;
      logger.error(errorMsg);
      new Notice(`Error: ${specificError}`, 8000);
      return { success: false, error: errorMsg };
    }
  }
}
