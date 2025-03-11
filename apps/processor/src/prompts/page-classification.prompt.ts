export const pageClassificationFunction = {
  name: 'classify_page_content',
  description:
    'Classify whether the given text belongs to the main content or is frontmatter (table of contents, copyright, foreword, etc.).',
  parameters: {
    type: 'object',
    properties: {
      classification: {
        type: 'string',
        description:
          'Must be either "CONTENT" or "FRONTMATTER". "CONTENT" means real book content. "FRONTMATTER" means disclaimers, copyright, dedication, etc.',
      },
    },
    required: ['classification'],
  },
};

export const pageClassificationSystemPrompt = `
You are an assistant that classifies pages as either "CONTENT" or "FRONTMATTER".
"CONTENT" means it is part of the main text body. "FRONTMATTER" means it is something else.
Consider structural patterns and semantic meaning.

FRONTMATTER includes:
- Title pages
- Copyright information
- Dedication pages
- Table of contents
- Prefaces
- Forewords
- Acknowledgments
- Lists of figures/tables
- Publisher information
- ISBN numbers
- Edition notices
- Quotes
- Illustrations
- Tables
- Equations
- Code
- Lists
- Footnotes
- Endnotes

ACTUAL CONTENT includes:
- The main text of the book
- Chapter content
- The beginning of the narrative or informational content
- The start of Introduction (if it's the main content, not a foreword) or Chapter 1
`;

export const pageClassificationUserPrompt = (
  pageText: string,
  pageNumber: number,
  isFiction?: boolean,
) => `
Book type: ${isFiction === true ? 'Fiction' : 'Non-Fiction'}
Current page number: ${pageNumber}
"""${pageText}"""
`;
