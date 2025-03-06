## Implementation Plan for Book Cover-to-Text AI Pipeline

### 1. Overall Architecture

Turborepo monorepo structure:

1. **Frontend Service (apps/web)**: 
   - User interface for uploading book cover images
   - Displaying processed text results
   - Communicating with the backend API

2. **Backend API Service (apps/api)**:
   - Handles user authentication (if needed)
   - Receives image uploads
   - Validates images
   - Manages job queues using BullMQ
   - Communicates with the processing service

3. **Processing Service (new - apps/processor)**:
   - Single NestJS application with modular architecture
   - Takes jobs from the queue
   - Performs image validation
   - Identifies the book from its cover
   - Determines if the book is fiction or non-fiction
   - Retrieves the appropriate page content
   - Returns the processed results back to the API

4. **Shared Packages**:
   - **database**: For database connections and models
   - **types**: For shared TypeScript type definitions
   - **eslint-config & typescript-config**: For consistent code styling and TypeScript configuration

### 2. Infrastructure Components

1. **Redis**:
   - Implement as a service in Docker Compose
   - Used by BullMQ for job queues

2. **PostgreSQL**:
   - Already configured in docker-compose.yml
   - Store user data, job status, and book metadata

3. **Docker Compose**:
   - Update to include Redis and the new processing service

### 3. Technical Implementation

#### 3.1 Image Validation
- Use computer vision libraries to detect if the uploaded image clearly contains a book
- Implementation options:
  - TensorFlow.js with a pre-trained model
  - Google Cloud Vision API
  - Amazon Rekognition
  - Custom model using simple heuristics (aspect ratio, edges, etc.)

#### 3.2 Book Identification (Multi-step Process)
- Extract text from the cover using OCR (Optical Character Recognition)
  - Use Google Vision API for better handling of stylized fonts on book covers
  - Implement post-processing to improve OCR accuracy (spell checking against book titles)
- Match the cover with book metadata using tiered approach:
  1. ISBN lookup if visible on the cover
  2. Google Books API by title/author
  3. Open Library API as backup
  4. Image-based recognition as fallback if OCR fails

#### 3.3 Fiction vs Non-Fiction Classification
- Primary method: Use book metadata from APIs to determine genre
  - Google Books API returns categories/genres that can reliably identify fiction vs non-fiction
  - Open Library also provides subject categories
- Fallback method: Use NLP to classify based on book description or extracted content

#### 3.4 Page Content Retrieval (Tiered Strategy)
We'll implement a tiered fallback approach for content retrieval:

1. **Google Books API Preview** (Primary Method):
   - Fetch preview pages that include first/second pages of content
   - Apply OCR if necessary to extract text from preview images
   - Handle pagination to get exactly the pages we need
   - Implement caching to avoid repeated API calls for the same book

2. **Open Library / Internet Archive APIs** (Secondary Method):
   - Check if the book is available in digital lending library
   - For public domain books, download full text
   - For in-copyright books, access borrowable content if available

3. **Web Search for Excerpts** (Fallback Method):
   - Search for book excerpts, first lines, or chapter previews
   - Query publisher websites that might host official excerpts
   - Implement specialized search queries (e.g., "title + 'excerpt'" or "title + 'first page'")

4. **Content Cleanup and Verification**:
   - Process OCR results to correct common errors
   - Verify content matches the requested section (first or second page)
   - Filter out front matter to ensure we're getting actual content

### 4. Processor Service Architecture

Rather than separate microservices, we'll implement a modular NestJS application with the following modules:

1. **Queue Consumer Module**:
   - Manages BullMQ connections and job processing
   - Handles job status updates and error reporting

2. **Image Validation Module**:
   - Processes uploaded images
   - Detects if a valid book cover is present
   - Provides feedback for image quality issues

3. **Book Identification Module**:
   - Performs OCR on cover images
   - Integrates with book metadata APIs
   - Implements the multi-tier identification strategy

4. **Content Retrieval Module**:
   - Implements the tiered content retrieval approach
   - Handles API integrations with Google Books, OpenLibrary, etc.
   - Processes and cleans up the extracted content

5. **Classification Module**:
   - Determines if books are fiction or non-fiction
   - Selects appropriate pages based on classification

6. **Caching Module**:
   - Implements caching strategies for API responses
   - Reduces redundant API calls and improves performance

### 5. Implementation Steps

1. **Set up the infrastructure**:
   - Add Redis to docker-compose.yml
   - Configure BullMQ in the API service
   - Create the processor service structure with NestJS

2. **Develop the API endpoints**:
   - Image upload endpoint
   - Job status endpoint
   - Results retrieval endpoint

3. **Implement the queue system**:
   - Create queue producers in the API service
   - Set up queue consumers in the processor service

4. **Develop the processor service modules**:
   - Image validation module
   - Book identification module  
   - Classification module
   - Content retrieval module
   - Implement caching throughout the pipeline

5. **Create the web frontend**:
   - Image upload interface with preview
   - Progress tracking for multi-step processing
   - Results display with appropriate formatting

### 6. Legal and Ethical Considerations

1. **Content Limitations**:
   - Strictly limit extracted content to just the required pages
   - Add metadata showing the source of the content (e.g., "Via Google Books Preview")

2. **Terms of Service Compliance**:
   - Respect API usage limits and terms of service
   - Implement rate limiting for all external API calls
   - Store only what's necessary and permitted

3. **Error Handling and Fallbacks**:
   - Provide clear user messaging when content cannot be legally retrieved
   - Implement appropriate fallbacks when primary sources fail