import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

interface LibgenBook {
  id: string;
  author: string;
  title: string;
  publisher: string;
  year: string;
  pages: number;
  language: string;
  size: string;
  extension: string;
  md5: string;
  bookUrl: string | null;
}

@Injectable()
export class LibgenService {
  private readonly logger = new Logger(LibgenService.name);
  private readonly baseUrl = 'https://libgen.is';
  private readonly supportedFormats = ['pdf', 'epub'];
  private readonly maxFileSizeMB = 100; // Maximum file size for download in MB

  /**
   * Search for a book by title and author's last name
   * @param title Book title
   * @param authorLastName Author's last name
   * @returns Array of book results
   */
  async searchBook(
    title: string,
    authorLastName: string,
  ): Promise<LibgenBook[]> {
    try {
      const searchQuery = `${title} ${authorLastName}`;
      const encodedQuery = encodeURIComponent(searchQuery);
      const searchUrl = `${this.baseUrl}/search.php?req=${encodedQuery}&phrase=1&view=simple&column=def&sort=extension&sortmode=DESC`;

      this.logger.log(`Searching for book: ${searchQuery}`);
      this.logger.log(`Search URL: ${searchUrl}`);

      const response = await axios.get(searchUrl);
      const $ = cheerio.load(response.data);

      const books: LibgenBook[] = [];

      // Find all table rows with book information
      $('table.c tr').each((i, element) => {
        // Skip the header row
        if (i === 0) return;

        const tds = $(element).find('td');
        if (tds.length < 9) return;

        const id = $(tds[0]).text().trim();
        const author = $(tds[1]).text().trim();
        const titleElement = $(tds[2]).find('a[href^="book/index.php"]');
        const title = titleElement.text().trim();
        const bookUrl = titleElement.attr('href');
        const md5Hash = bookUrl
          ? bookUrl.match(/md5=([a-fA-F0-9]+)/)?.[1]
          : null;
        const publisher = $(tds[3]).text().trim();
        const year = $(tds[4]).text().trim();
        const pages = $(tds[5]).text().trim();
        const language = $(tds[6]).text().trim();
        const size = $(tds[7]).text().trim();
        const extension = $(tds[8]).text().trim().toLowerCase();

        // Only include supported formats and files under the size limit
        const sizeMB = this.parseFileSizeMB(size);
        if (
          this.supportedFormats.includes(extension) &&
          md5Hash &&
          sizeMB <= this.maxFileSizeMB
        ) {
          books.push({
            id,
            author,
            title,
            publisher,
            year,
            pages: parseInt(pages) || 0,
            language,
            size,
            extension,
            md5: md5Hash,
            bookUrl: bookUrl ? `${this.baseUrl}/${bookUrl}` : null,
          });
        }
      });

      this.logger.log(
        `Found ${books.length} books in supported formats under ${this.maxFileSizeMB}MB`,
      );
      return books;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error searching for book: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Parse file size string to MB
   * @param sizeStr Size string (e.g., "5.2 MB", "450 KB")
   * @returns Size in MB
   */
  private parseFileSizeMB(sizeStr: string): number {
    try {
      const sizeMatch = sizeStr.match(/^([\d.]+)\s*([KMG]B)$/i);
      if (!sizeMatch || !sizeMatch[1] || !sizeMatch[2]) return 0;

      const sizeNum = sizeMatch[1];
      const unit = sizeMatch[2];
      const size = parseFloat(sizeNum);

      switch (unit.toUpperCase()) {
        case 'KB':
          return size / 1024;
        case 'MB':
          return size;
        case 'GB':
          return size * 1024;
        default:
          return 0;
      }
    } catch (e) {
      return 0; // Return 0 if parsing fails
    }
  }

  /**
   * Get the download link for a book by MD5 hash
   * @param md5 MD5 hash of the book
   * @returns Direct download URL
   */
  async getDownloadLink(md5: string): Promise<string> {
    try {
      const mirrorUrl = `http://books.ms/main/${md5}`;
      this.logger.log(`Getting download link from: ${mirrorUrl}`);

      const response = await axios.get(mirrorUrl);
      const $ = cheerio.load(response.data);

      // Find the direct download link (GET button)
      const downloadLink = $('#download h2 a').first().attr('href');

      if (!downloadLink) {
        throw new Error('Download link not found');
      }

      this.logger.log(`Found download link: ${downloadLink}`);
      return downloadLink;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error getting download link: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Download a book from a direct download URL
   * @param downloadUrl Direct download URL
   * @param outputPath Path to save the downloaded file
   * @returns Path to the downloaded file
   */
  async downloadBook(downloadUrl: string, outputPath: string): Promise<string> {
    try {
      this.logger.log(`Downloading book from: ${downloadUrl}`);

      // Create directory if it doesn't exist
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Create a temporary file path to download to
      const tempFilePath = `${outputPath}.tmp`;

      // Download the file directly
      const response = await axios({
        method: 'GET',
        url: downloadUrl,
        responseType: 'arraybuffer',
        timeout: 120000, // 2 minutes
      });

      // Check file size
      const contentLength = response.headers['content-length'];
      const fileSize = response.data.length;
      const fileSizeMB = fileSize / (1024 * 1024);

      this.logger.log(`Downloaded file size: ${fileSizeMB.toFixed(2)} MB`);

      // Verify file size is within limits
      if (fileSizeMB > this.maxFileSizeMB) {
        const error = new Error(
          `File size (${fileSizeMB.toFixed(2)} MB) exceeds download limit of ${this.maxFileSizeMB} MB.`,
        );
        this.logger.error(error.message);
        throw error;
      }

      // Write the file to disk
      fs.writeFileSync(tempFilePath, response.data);

      // Remove the target file if it already exists
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }

      // Rename the temp file
      fs.renameSync(tempFilePath, outputPath);

      this.logger.log(
        `Book downloaded to: ${outputPath} (${fileSizeMB.toFixed(2)} MB)`,
      );

      // Verify the file exists and has content
      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        this.logger.log(`File verified: ${outputPath} exists and has content`);
        return outputPath;
      } else {
        const error = new Error(
          `File download failed: ${outputPath} does not exist or is empty`,
        );
        this.logger.error(error.message);
        throw error;
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error downloading book: ${errorMessage}`);

      // Clean up temp file if it exists
      const tempFilePath = `${outputPath}.tmp`;
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }

      throw error;
    }
  }

  /**
   * Find and download a book by title and author's last name
   * @param title Book title
   * @param authorLastName Author's last name
   * @param outputDir Directory to save the downloaded file
   * @param preferredFormat Preferred format (pdf or epub)
   * @returns Path to the downloaded file
   */
  async findAndDownloadBook(
    title: string,
    authorLastName: string,
    outputDir: string = './downloads',
    preferredFormat: 'pdf' | 'epub' = 'pdf',
  ): Promise<string | null> {
    try {
      // Search for the book
      const books = await this.searchBook(title, authorLastName);

      if (books.length === 0) {
        this.logger.warn(`No books found for: ${title} ${authorLastName}`);
        return null;
      }

      // Group books by format
      const booksByFormat: { [key: string]: LibgenBook[] } = {};
      books.forEach((book) => {
        if (!booksByFormat[book.extension]) {
          booksByFormat[book.extension] = [];
        }
        booksByFormat[book.extension]?.push(book);
      });

      // First try to get the preferred format
      let selectedBook: LibgenBook | null = null;

      // Sort books by preference
      const sortBooksByPreference = (books: LibgenBook[]): LibgenBook[] => {
        // Sort by pages (descending) to get the book with the most pages
        return [...books].sort((a, b) => b.pages - a.pages);
      };

      if (
        booksByFormat[preferredFormat] &&
        booksByFormat[preferredFormat].length > 0
      ) {
        // Sort by pages (descending)
        const sortedBooks = sortBooksByPreference(
          booksByFormat[preferredFormat],
        );
        selectedBook = sortedBooks[0] || null;
        if (selectedBook) {
          const sizeMB = this.parseFileSizeMB(selectedBook.size);
          this.logger.log(
            `Found book in preferred format (${preferredFormat}): ${selectedBook.title} (${sizeMB.toFixed(2)} MB)`,
          );
        }
      } else {
        // Try other supported formats
        for (const format of this.supportedFormats) {
          if (
            format !== preferredFormat &&
            booksByFormat[format] &&
            booksByFormat[format].length > 0
          ) {
            // Sort by pages (descending)
            const sortedBooks = sortBooksByPreference(booksByFormat[format]);
            selectedBook = sortedBooks[0] || null;
            if (selectedBook) {
              const sizeMB = this.parseFileSizeMB(selectedBook.size);
              this.logger.log(
                `Found book in alternative format (${format}): ${selectedBook.title} (${sizeMB.toFixed(2)} MB)`,
              );
              break;
            }
          }
        }
      }

      // Make sure book exists before proceeding
      if (!selectedBook) {
        this.logger.warn(`No valid book found for: ${title} ${authorLastName}`);
        return null;
      }

      const sizeMB = this.parseFileSizeMB(selectedBook.size);
      this.logger.log(
        `Selected book: ${selectedBook.title} (${selectedBook.pages} pages, ${selectedBook.extension}, ${sizeMB.toFixed(2)} MB)`,
      );

      // Get the download link
      const downloadUrl = await this.getDownloadLink(selectedBook.md5);

      // Create a safe filename
      const safeTitle = selectedBook.title
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 50);
      const outputPath = path.join(
        outputDir,
        `${safeTitle}_${selectedBook.md5}.${selectedBook.extension}`,
      );

      // Download the book
      return await this.downloadBook(downloadUrl, outputPath);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error finding and downloading book: ${errorMessage}`);
      return null;
    }
  }
}
