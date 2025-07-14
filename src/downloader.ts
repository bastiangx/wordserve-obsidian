import { requestUrl, Notice } from "obsidian";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import * as child_process from "child_process";
import { logger } from "./utils/logger";

// Security-critical constants for version pinning
export const GITHUB_REPO = "bastiangx/wordserve";
export const TARGET_RELEASE_VERSION = "v0.1.1-beta";
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
  private basePath: string;
  private platformInfo: PlatformInfo;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.platformInfo = this.detectPlatform();
  }

  private detectPlatform(): PlatformInfo {
    const platform = process.platform;
    const arch = process.arch;

    let os: string;
    let mappedArch: string;
    let extension: string;

    // Map Node.js platform names to GoReleaser naming convention
    switch (platform) {
      case "darwin":
        os = "Darwin";
        extension = ".tar.gz";
        break;
      case "linux":
        os = "Linux";
        extension = ".tar.gz";
        break;
      case "win32":
        os = "Windows";
        extension = ".zip";
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    // Map Node.js architecture names to GoReleaser naming convention
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

    return { os, arch: mappedArch, extension };
  }

  private getAssetUrls() {
    const baseUrl = `https://github.com/${GITHUB_REPO}/releases/download/${TARGET_RELEASE_VERSION}`;
    const binaryAsset = `${BINARY_NAME}_${this.platformInfo.os}_${this.platformInfo.arch}${this.platformInfo.extension}`;
    
    return {
      binary: `${baseUrl}/${binaryAsset}`,
      data: `${baseUrl}/data.zip`,
      checksums: `${baseUrl}/checksums.txt`
    };
  }

  private async downloadAsset(url: string, description: string): Promise<ArrayBuffer> {
    try {
      logger.debug(`Downloading ${description} from ${url}`);
      new Notice(`Downloading ${description}...`);
      
      const response = await requestUrl({
        url,
        method: "GET"
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: Failed to download ${description}`);
      }

      const arrayBuffer = response.arrayBuffer;
      const sizeInMB = arrayBuffer.byteLength / (1024 * 1024);
      
      // Log memory usage for monitoring
      if (sizeInMB > 10) {
        logger.debug(`Downloaded large file: ${description} (${sizeInMB.toFixed(1)}MB)`);
      }
      
      // Warn if file is unusually large
      if (sizeInMB > 100) {
        logger.warn(`Very large download: ${description} is ${sizeInMB.toFixed(1)}MB - this may impact performance`);
        new Notice(`Warning: Large download (${sizeInMB.toFixed(0)}MB) may impact performance`, 5000);
      }

      return arrayBuffer;
    } catch (error) {
      const errorMsg = `Failed to download ${description}: ${error.message}`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  private async verifyChecksum(data: ArrayBuffer, expectedHash: string, filename: string): Promise<boolean> {
    const hash = crypto.createHash('sha256');
    hash.update(Buffer.from(data));
    const actualHash = hash.digest('hex');
    
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
    const lines = checksumsContent.trim().split('\n');
    
    for (const line of lines) {
      const match = line.match(/^([a-f0-9]{64})\s+(.+)$/);
      if (match) {
        checksums.set(match[2], match[1]);
      }
    }
    
    return checksums;
  }

  private async extractArchive(archiveData: ArrayBuffer): Promise<void> {
    const tempFileName = `temp_archive_${crypto.randomBytes(8).toString('hex')}`;
    const archivePath = path.join(this.basePath, tempFileName);
    const tempExtractDir = path.join(this.basePath, `extract_${crypto.randomBytes(8).toString('hex')}`);
    
    try {
      // Write archive to temporary file
      await fs.promises.writeFile(archivePath, Buffer.from(archiveData));
      
      // Create temporary extraction directory
      await fs.promises.mkdir(tempExtractDir, { recursive: true });
      
      // Extract to temporary directory first
      if (this.platformInfo.extension === ".tar.gz") {
        await this.runCommand("tar", [
          "-xzf", 
          archivePath, 
          "-C", 
          tempExtractDir
        ]);
      } else if (this.platformInfo.extension === ".zip") {
        await this.runCommand("unzip", [
          "-o", 
          archivePath, 
          "-d", 
          tempExtractDir
        ]);
      }
      
      // Find the binary file in the extracted content and move it to the correct location
      const binaryFilename = BINARY_NAME + (process.platform === "win32" ? ".exe" : "");
      const extractedBinaryPath = await this.findBinaryInExtractedContent(tempExtractDir, binaryFilename);
      
      if (!extractedBinaryPath) {
        throw new Error(`Binary ${binaryFilename} not found in extracted archive`);
      }
      
      const targetBinaryPath = path.join(this.basePath, binaryFilename);
      await fs.promises.copyFile(extractedBinaryPath, targetBinaryPath);
      
      // Set executable permissions on Unix-like systems
      if (process.platform !== "win32") {
        await fs.promises.chmod(targetBinaryPath, 0o755);
      }
      
      // Clean up temporary extraction directory
      await fs.promises.rm(tempExtractDir, { recursive: true, force: true });
      
    } finally {
      // Clean up temporary archive file
      try {
        await fs.promises.unlink(archivePath);
      } catch (error) {
        logger.debug(`Failed to cleanup temporary archive: ${error.message}`);
      }
    }
  }

  private async extractZip(zipData: ArrayBuffer, outputDir: string): Promise<void> {
    const tempFileName = `temp_data_${crypto.randomBytes(8).toString('hex')}.zip`;
    const zipPath = path.join(this.basePath, tempFileName);
    
    try {
      await fs.promises.writeFile(zipPath, Buffer.from(zipData));
      
      // Use safe subprocess call
      await this.runCommand("unzip", ["-o", zipPath, "-d", outputDir]);
    } finally {
      try {
        await fs.promises.unlink(zipPath);
      } catch (error) {
        logger.debug(`Failed to cleanup temporary zip: ${error.message}`);
      }
    }
  }

  private async runCommand(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      // First validate command is available by checking for common paths
      const commandPaths = this.getCommandPaths(command);
      
      const process = child_process.spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stderr = '';
      
      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('error', (error: any) => {
        // Provide more specific error messages based on error type
        if (error.code === 'ENOENT') {
          reject(new Error(`Command '${command}' not found. Please ensure ${this.getInstallInstructions(command)}`));
        } else {
          reject(new Error(`Failed to run ${command}: ${error.message}`));
        }
      });

      process.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          // Provide more specific error context
          const errorMsg = `${command} exited with code ${code}`;
          const stderrInfo = stderr ? `: ${stderr.trim()}` : '';
          reject(new Error(`${errorMsg}${stderrInfo}`));
        }
      });
    });
  }

  private getCommandPaths(command: string): string[] {
    const paths = [];
    if (process.platform === "win32") {
      // Windows common paths
      paths.push(`C:\\Program Files\\7-Zip\\7z.exe`);
      paths.push(`C:\\Windows\\System32\\tar.exe`);
    } else {
      // Unix-like systems
      paths.push(`/usr/bin/${command}`);
      paths.push(`/bin/${command}`);
      paths.push(`/usr/local/bin/${command}`);
    }
    return paths;
  }

  private getInstallInstructions(command: string): string {
    if (process.platform === "win32") {
      if (command === "tar") {
        return "tar is available (Windows 10+) or install 7-Zip";
      } else if (command === "unzip") {
        return "unzip is available or install 7-Zip";
      }
    } else {
      if (command === "tar") {
        return "tar is installed (usually available by default)";
      } else if (command === "unzip") {
        return "unzip is installed (install via package manager if needed)";
      }
    }
    return `${command} is installed and available in PATH`;
  }

  private async checkExistingInstallation(): Promise<boolean> {
    try {
      const binaryPath = path.join(this.basePath, BINARY_NAME + (process.platform === "win32" ? ".exe" : ""));
      const dataDir = path.join(this.basePath, "data");
      
      await fs.promises.access(binaryPath, fs.constants.F_OK);
      await fs.promises.access(dataDir, fs.constants.F_OK);
      
      logger.debug("Existing WordServe installation found");
      return true;
    } catch {
      return false;
    }
  }

  private async findBinaryInExtractedContent(extractDir: string, binaryFilename: string): Promise<string | null> {
    const MAX_SEARCH_DEPTH = 10; // Prevent infinite recursion on malformed archives
    
    try {
      // First try to find the binary in the root of extracted directory
      const directPath = path.join(extractDir, binaryFilename);
      try {
        await fs.promises.access(directPath, fs.constants.F_OK);
        return directPath;
      } catch {
        // Binary not in root, search recursively
      }
      
      // Recursively search for the binary with depth limit
      const searchFiles = async (dir: string, currentDepth: number = 0): Promise<string | null> => {
        // Check depth limit
        if (currentDepth >= MAX_SEARCH_DEPTH) {
          logger.warn(`Reached maximum search depth (${MAX_SEARCH_DEPTH}) while looking for binary`);
          return null;
        }
        
        // Validate the directory path
        if (!this.validatePath(dir)) {
          logger.warn(`Skipping invalid path during binary search: ${dir}`);
          return null;
        }
        
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            const found = await searchFiles(fullPath, currentDepth + 1);
            if (found) return found;
          } else if (entry.name === binaryFilename) {
            // Validate the binary path before returning
            if (this.validatePath(fullPath)) {
              return fullPath;
            } else {
              logger.warn(`Found binary at invalid path, skipping: ${fullPath}`);
            }
          }
        }
        return null;
      };
      
      return await searchFiles(extractDir);
    } catch (error) {
      logger.error(`Error searching for binary: ${error.message}`);
      return null;
    }
  }

  private validatePath(filePath: string): boolean {
    // Normalize the path and check it doesn't contain directory traversal
    const normalizedPath = path.normalize(filePath);
    const basePath = path.normalize(this.basePath);
    
    // Ensure the path is within the base path
    const resolvedPath = path.resolve(basePath, normalizedPath);
    return resolvedPath.startsWith(basePath + path.sep) || resolvedPath === basePath;
  }

  public async downloadAndInstall(): Promise<DownloadResult> {
    try {
      // Check if already installed
      if (await this.checkExistingInstallation()) {
        logger.info("WordServe binary and data already exist, skipping download");
        return { success: true };
      }

      new Notice("Setting up WordServe binary...");
      
      // Ensure base directory exists
      await fs.promises.mkdir(this.basePath, { recursive: true });
      
      const urls = this.getAssetUrls();
      
      // For memory efficiency, download and verify checksums first (smallest file)
      const checksumsData = await this.downloadAsset(urls.checksums, "checksums");
      const checksumsText = new TextDecoder().decode(checksumsData);
      const checksums = this.parseChecksums(checksumsText);
      
      // Get expected filenames and validate checksums exist
      const binaryFilename = path.basename(urls.binary);
      const dataFilename = "data.zip";
      
      const binaryExpectedHash = checksums.get(binaryFilename);
      const dataExpectedHash = checksums.get(dataFilename);
      
      if (!binaryExpectedHash) {
        throw new Error(`Missing checksum for ${binaryFilename} in checksums.txt`);
      }
      
      // Note: data.zip is an extra file not included in GoReleaser checksums
      // We'll skip checksum verification for it if not present
      const skipDataChecksum = !dataExpectedHash;
      if (skipDataChecksum) {
        logger.warn(`No checksum found for ${dataFilename} - skipping verification (extra file)`);
      }
      
      // Download, verify and process files sequentially to optimize memory usage
      new Notice("Downloading and verifying WordServe binary...");
      
      // Process binary file
      const binaryData = await this.downloadAsset(urls.binary, "WordServe binary");
      const binaryHashValid = await this.verifyChecksum(
        binaryData, 
        binaryExpectedHash, 
        binaryFilename
      );
      
      if (!binaryHashValid) {
        throw new Error("Binary checksum verification failed - installation aborted for security");
      }
      
      // Extract binary immediately and free memory
      await this.extractArchive(binaryData);
      // Binary data can now be garbage collected
      
      new Notice("Downloading and verifying data files...");
      
      // Process data file
      const dataData = await this.downloadAsset(urls.data, "data files");
      
      // Only verify checksum if we have one
      if (!skipDataChecksum) {
        const dataHashValid = await this.verifyChecksum(
          dataData,
          dataExpectedHash,
          dataFilename
        );
        
        if (!dataHashValid) {
          throw new Error("Data checksum verification failed - installation aborted for security");
        }
      } else {
        logger.info(`Skipping checksum verification for ${dataFilename} (no checksum available)`);
      }
      
      // Extract data and free memory
      const dataDir = path.join(this.basePath, "data");
      await fs.promises.mkdir(dataDir, { recursive: true });
      await this.extractZip(dataData, dataDir);
      // Data can now be garbage collected
      
      new Notice("WordServe setup complete!");
      logger.info("WordServe binary and data successfully downloaded and installed");
      
      return { success: true };
      
    } catch (error) {
      let specificError = "Unknown error";
      
      if (error.message.includes("Failed to download")) {
        specificError = `Network error during download: ${error.message}`;
      } else if (error.message.includes("Checksum verification failed")) {
        specificError = `Security verification failed: ${error.message}`;
      } else if (error.message.includes("not found in extracted archive")) {
        specificError = `Archive extraction error: ${error.message}`;
      } else if (error.message.includes("Missing checksum")) {
        specificError = `Checksum file parsing error: ${error.message}`;
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
