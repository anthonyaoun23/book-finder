export const formatSnippetFunction = {
  name: 'format_extracted_snippet',
  description:
    'Format the extracted snippet of text in a user-friendly style, e.g., minimal markdown or paragraphs. Return as a single string.',
  parameters: {
    type: 'object',
    properties: {
      formattedText: {
        type: 'string',
        description:
          'A user-friendly version of the text snippet with minimal formatting (markdown or simple line breaks).',
      },
    },
    required: ['formattedText'],
  },
};

export const formatSnippetSystemPrompt = `
You are a text reformatter. You take raw text from a book page and reformat it so it's nice for display in a UI. 
If there is a chapter title, include it in the formatted text.
Do not summarize the text, just reformat it.
`;

export const formatSnippetUserPrompt = (pageText: string) => `
Raw extracted text:
"""
${pageText}
"""
Please return a JSON function call to "format_extracted_snippet".
`;
