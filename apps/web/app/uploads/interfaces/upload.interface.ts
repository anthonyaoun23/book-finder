export interface Book {
  id: string;
  title: string;
  author: string;
  fiction: boolean;
  pageContent?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Upload {
  id: string;
  imageUrl?: string;
  extractedTitle?: string;
  extractedAuthor?: string;
  extractedFiction?: boolean;
  bookId?: string;
  book?: Book;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
} 