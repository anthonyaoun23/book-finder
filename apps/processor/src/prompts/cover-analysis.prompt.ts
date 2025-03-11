export const coverAnalysisFunction = {
  name: 'analyze_book_cover',
  description:
    'Analyze an image to detect if a book is present. If it is, extract the book metadata: title, author, and whether it is fiction.',
  parameters: {
    type: 'object',
    properties: {
      isBook: {
        type: 'boolean',
        description: 'Whether or not the image is definitely a book cover',
      },
      confidence: {
        type: 'number',
        description:
          'Confidence level (0.0 to 1.0) that the cover truly is a book',
      },
      title: {
        type: 'string',
        description: 'Detected title of the book, if found. Otherwise null',
      },
      author: {
        type: 'string',
        description: 'Detected author of the book, if found. Otherwise null',
      },
      fiction: {
        type: 'boolean',
        description:
          'Boolean indicating if the book is fiction. Or null if unknown.',
      },
    },
    required: ['isBook', 'confidence', 'title', 'author', 'fiction'],
  },
};

export const coverAnalysisSystemPrompt = `
You are a specialized assistant for analyzing images of book covers.
You must detect if the image shows a book. If so, parse out the title, author, and guess if it's fiction or not.
Be concise but accurate. Use any text you see or standard knowledge. If not sure, guess false for isBook or return an empty title/author.

Here is the image of what might be a book cover.
Please analyze it carefully.
`;
