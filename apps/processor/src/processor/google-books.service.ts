import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

// Updated GoogleBook interface to include more complete data
interface GoogleBook {
  id: string;
  volumeInfo: {
    title: string;
    authors?: string[]; // Optional to handle cases where authors might be absent
    previewLink?: string; // URL to the Google Books preview
    industryIdentifiers?: Array<{ type: string; identifier: string }>; // ISBN and other identifiers
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
    };
    description?: string;
    publishedDate?: string;
    publisher?: string;
  };
  accessInfo: {
    pdf?: { isAvailable: boolean };
    epub?: { isAvailable: boolean };
    textToSpeech?: { isAvailable: boolean };
    viewability?: string; // Access View Status
    webReaderLink?: string; // Direct web reader link
  };
}

@Injectable()
export class GoogleBooksService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://www.googleapis.com/books/v1/volumes';
  private readonly logger = new Logger(GoogleBooksService.name);

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GOOGLE_BOOKS_API_KEY') || '';
  }

  async searchBook(title: string, author: string): Promise<GoogleBook | null> {
    try {
      const query = `${encodeURIComponent(title)}+inauthor:${encodeURIComponent(author)}`;
      const response = await axios.get(
        `${this.baseUrl}?q=${query}&key=${this.apiKey}`,
      );

      // Type assertion for response data
      const items = (response.data?.items || []) as GoogleBook[];

      const book = items.find(
        (item) =>
          item.volumeInfo.title.toLowerCase().includes(title.toLowerCase()) &&
          item.volumeInfo.authors?.some((a) =>
            a.toLowerCase().includes(author.toLowerCase()),
          ),
      );

      if (!book) {
        this.logger.warn(
          `No matching book found for title: ${title}, author: ${author}`,
        );
      }
      return book || null;
    } catch (error) {
      this.logger.error(
        `Google Books API error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
