# Book Finder

**Book Finder** is an AI-driven pipeline that processes a user-uploaded image of a book cover to extract text from the book’s first (or second) content page. The system verifies that the image is indeed a book cover using multiple AI services, refines the metadata (title, author, and whether the book is fiction), downloads the book from a third-party source (LibGen), and finally extracts and formats the target page for display.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Repository Structure](#repository-structure)
- [Architecture & Flowchart](#architecture--flowchart)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Docker Compose](#docker-compose)
- [Pipeline Steps Explanation](#pipeline-steps-explanation)
- [License](#license)

---

## Project Overview

Book Finder is divided into three main applications:

- **API (apps/api):**  
  A NestJS backend that exposes endpoints (e.g., a `/upload` endpoint) for the client to submit a book cover image and retrieve processing results.

- **Processor (apps/processor):**  
  A NestJS-based set of BullMQ workers that handle the processing pipeline. The key processors are:

  - **FileUploadProcessor:** Uploads the image to S3 and queues the next job.
  - **ImageAnalysisProcessor:** Uses an LLM (e.g., OpenAI) to determine if the image is a valid book cover and extracts preliminary metadata.
  - **BookLookupProcessor:** Uses Google Books to refine metadata (title, author) if available.
  - **BookDownloadProcessor:** Uses LibGen to download the book in the appropriate format.
  - **ContentExtractionProcessor:** Extracts text from the PDF/EPUB by determining the correct content page (first page for non-fiction, second for fiction) and formatting it for display.
  - **Supporting services:** Include additional validation (e.g., using Rekognition or Textract), book formatting, and a custom LLM service for prompt handling.

- **Web (apps/web):**  
  A Next.js frontend where users can upload their book cover images and view the final extracted text along with metadata.

The database (managed by Prisma in `packages/database`) stores user uploads and book records.

---

## Repository Structure

```
book-finder/
├── README.md # This file
├── apps/
│ ├── api/ # API backend for file upload and status queries
│ │ ├── Dockerfile
│ │ ├── README.md
│ │ ├── src/
│ │ │ ├── app.module.ts
│ │ │ ├── db/
│ │ │ ├── health.controller.ts
│ │ │ ├── main.ts
│ │ │ └── upload/ # Upload controllers, services, etc.
│ ├── processor/ # Processing pipeline with BullMQ workers
│ │ ├── Dockerfile
│ │ ├── README.md
│ │ ├── src/
│ │ │ ├── app.module.ts
│ │ │ ├── db/
│ │ │ ├── processors/ # Key processors: file-upload, image-analysis, book-lookup, book-download, content-extraction
│ │ │ ├── prompts/ # Specialized prompt definitions & function calling schemas
│ │ │ └── utils/ # Base processor classes, decorators, etc.
│ │ └── downloads/ # Temporary storage for downloaded book files
│ └── web/ # Frontend (Next.js) client
│ ├── README.md
│ ├── app/ # Application code (pages, components, etc.)
│ ├── public/ # Static assets
│ └── package.json
├── packages/
│ └── database/ # Prisma database schema and generated client
│ ├── prisma/
│ │ └── schema.prisma
│ └── package.json
├── docker-compose.yml # Compose file for Postgres, Redis, etc.
├── pnpm-workspace.yaml
└── turbo.json # Turborepo configuration
```

---

## Architecture & Flowchart

Below is a Mermaid diagram illustrating the interactions between components in the Book Finder pipeline:

Click here to view [Live Mermaid Editor](https://mermaid.live/edit#pako:eNp9VF1vozAQ_CsrP7VSo77noRIU8iGlatJcddJBHwwsxFewOds0rUr_-60xzZGeVCQk1jsz3p21eWe5KpDNWVmrY37g2sLmIZVAj-mySvP2AEfMbmuB0kKSsp-YwTX4OGVPHuqeIHk0qKFra8ULA5lSz5CrF1oSDa9wRKIsUvlFn7fCKQfb9ZlgmGzv9z_g2is6ZquEtN8IaSyECbu6vts5wQcXUrF-5Ux7l1wM2V2HHV5-I9lqlaMxSjvB7WdwphUlC1Hj41DlCTGH-xZlsB4t4JLXb0aYCS1OQrJoQ2_XTmhLpaoaweUMNVQKiRPSYiBF6ii_7LYR2RIlFGNmQlkmt0pamlb8ajXPrVBywlsIqgwsvloolW64tUJWE_YqWbvpBWP9Z_05KSK_8FoU3AX_-xiFycVWGVtpNBQ4p30igNnsBkIfhC7oY_nHTQN-qwxKcnTmB9_DzqN2AyUahQfKuvS7T05bD6spIq4NQsP18yDLDZScpEk0GvdeDbDhHECDllMnfPS9IdN6iD0unuA-XXaaPSw8YDEB5N5xwJPlPSw9bDnA9lZppC6df2RNV1vzr6TI-0H3gXLuLp0QU78gYFesQZqZKOj-vrtUyuyByk7ZnD4LLDnRUpbKD4Lyzqr9m8zZvORkyhXTqqsOp6hrqXOMBKdz35xWWy5_KUWx1R2FdGWo8Dv_xxh-HB9_Ae3NYd4)

```mermaid
flowchart LR
    subgraph webClient ["Web / Client"]
        A[1. User uploads book cover image]
    end

    subgraph api ["API"]
        B[POST /upload endpoint]
    end

    subgraph redisBullMQ ["Redis / BullMQ"]
        Q[(RedisQueue)]
    end

    subgraph processor ["Processor"]
        D[FileUploadProcessor<br> & OpenAI cover analysis]
        E[BookLookupProcessor<br> & Google Books refine]
        F[BookDownloadProcessor<br> & LibGen download]
        G[ContentExtractionProcessor<br> & Final text formatting]
        H[ImageAnalysisProcessor<br> & (Optional validation)]
    end

    DB[(Postgres DB)]

    A --> B
    B -->|Enqueue job ("file-upload")| Q
    Q --> D
    D -->|If valid book cover| H
    D -->|Else mark job as failed| DB
    H -->|Queue metadata refinement| E
    E -->|Queue download job| F
    F -->|Queue content extraction| G
    G -->|Store final results| DB
    DB -->|API reads results| B
    B --> A
```

### Diagram Explanation

1. **User Action:**  
   The user uploads an image via the Web client.

2. **API Endpoint:**  
   The API receives the upload, creates a new record in Postgres, and enqueues a job to the "file-upload" queue in Redis.

3. **FileUploadProcessor:**  
   This processor uploads the image to S3 and calls OpenAI (via the LLM service) to analyze the image. If the image is recognized as a book cover, the job proceeds; otherwise, it is marked as failed in the database.

4. **ImageAnalysisProcessor:**  
   (Optional step) May perform additional validation on the image or provide more refined metadata.

5. **BookLookupProcessor:**  
   Refines the metadata using Google Books and updates the database.

6. **BookDownloadProcessor:**  
   Searches LibGen using the refined metadata to download the book file.

7. **ContentExtractionProcessor:**  
   Reads the downloaded file, determines the correct content page (first page for non-fiction or second page for fiction), extracts and formats the text using LLM calls, and stores the final snippet in the database.

8. **Final API Read:**  
   The API reads the stored results from Postgres and returns them to the Web client.

---

## Getting Started

### Prerequisites

- **Node.js** (LTS recommended)
- **pnpm** (v8+)
- **Docker** (optional, for containerized deployment)
- **Postgres** and **Redis** (either installed locally or via Docker)

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/anthonyaoun23/book-finder.git
   cd book-finder
   ```

2. **Install dependencies:**

   ```bash
   pnpm install
   ```

3. **Set up the database:**

   Edit `packages/database/.env.sample` (or create your own `.env` in the appropriate apps) with your Postgres connection string, then run:

   ```bash
   pnpm --filter @repo/db db:migrate
   pnpm --filter @repo/db db:generate
   ```

---

## Environment Variables

Each application has its own sample `.env` file. For example:

- **API (apps/api/.env.sample):**

  - `PORT`
  - `DATABASE_URL`
  - `AWS_ACCESS_KEY`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_BUCKET_NAME`
  - `REDIS_URL`
  - Rate limit settings

- **Processor (apps/processor/.env.sample):**
  - `PORT`
  - `DATABASE_URL`
  - `OPENAI_API_KEY`
  - `GOOGLE_BOOKS_API_KEY`
  - `AWS_*` variables
  - `REDIS_URL`
  - (Optional) `DOWNLOAD_DIR`

Make copies of these samples as `.env` files and fill in your own credentials.

---

## Local Development

1. **Start Postgres & Redis:**

   Use Docker Compose or start services manually:

   ```bash
   docker-compose up -d
   ```

2. **Run the API:**

   ```bash
   cd apps/api
   turbo dev
   ```

3. **Run the Processor:**

   ```bash
   cd apps/processor
   turbo dev
   ```

4. **Run the Web Client:**

   ```bash
   cd apps/web
   turbo dev
   ```

5. **Or, run all apps from root:**
   ```bash
   turbo dev
   ```

---

## Docker Compose

A `docker-compose.yml` file is included for convenience. It sets up containers for Postgres and Redis, and optionally you can uncomment the sections for the API and Processor:

```bash
docker-compose up -d
```

Make sure the environment variables in your `.env` files match the settings in `docker-compose.yml`.

---

## Pipeline Steps Explanation

1. **User Upload:**
   - The user uploads a book cover image through the Web client.
2. **API Enqueue:**
   - The API creates an `Upload` record and enqueues a "file-upload" job in Redis.
3. **File Upload & Analysis:**
   - The **FileUploadProcessor** uploads the image to S3.
   - It then calls OpenAI via the LLM service to analyze the image.
   - If the image is not recognized as a book, the job is marked as failed.
4. **Image Analysis:**
   - The **ImageAnalysisProcessor** validates the cover and, if valid, enqueues a book lookup job.
5. **Metadata Refinement:**
   - The **BookLookupProcessor** calls Google Books to refine the metadata.
   - Refined data is saved to the database.
6. **Book Download:**
   - The **BookDownloadProcessor** uses LibGen to locate and download the book.
7. **Content Extraction:**
   - The **ContentExtractionProcessor** extracts the text from the correct content page (first page for non-fiction, second for fiction).
   - An LLM call is used to format the extracted text nicely.
   - The final snippet is saved, and the `Upload` record is marked as completed.
8. **Final Display:**
   - The Web client retrieves the processed result from the API and displays it to the user.

---

## License

This project is provided as-is for demonstration and interview purposes. Ensure you follow any applicable third-party API and data usage policies when deploying or modifying the code.
