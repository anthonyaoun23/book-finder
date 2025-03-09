# Book Finder - Deployment Guide

This guide provides instructions for deploying the Book Finder application to production environments.

## Application Architecture

Book Finder consists of three main components:
1. **Web Frontend** (Next.js) - To be deployed on Vercel
2. **API Service** (NestJS) - To be deployed on Render
3. **Processor Service** (NestJS) - To be deployed on Render
4. **Infrastructure** - PostgreSQL database and Redis on Render

## Preparing for Deployment

Before deploying, make sure to:
1. Fix any TypeScript errors in your code
2. Test your application locally with production configurations
3. Ensure all environment variables are properly set

## Pre-Deployment Testing Checklist

Before deploying your application, run through this checklist to ensure everything is ready:

### Code and Build

- [ ] All TypeScript errors are fixed (run `pnpm turbo check-types`)
- [ ] Linting passes for all packages (run `pnpm turbo lint`)
- [ ] All tests pass (run `pnpm turbo test`)
- [ ] The application builds successfully (run `pnpm turbo build`)

### Local Environment Testing

- [ ] Test with production-like environment variables
- [ ] Verify file uploads work correctly
- [ ] Verify book processing works end-to-end
- [ ] Test both the API and Processor services together
- [ ] Check that database migrations run correctly

### Security Checks

- [ ] No sensitive information is committed to the repository
- [ ] All API endpoints are properly secured
- [ ] Rate limiting is configured correctly
- [ ] Secret environment variables are identified and documented

### Environment Variables

- [ ] All required environment variables are documented
- [ ] Secret variables are ready to be configured in Render/Vercel
- [ ] Default values are appropriate for production

### Database

- [ ] Database schema is finalized
- [ ] Migrations are tested and ready
- [ ] Database backup strategy is in place

### Infrastructure

- [ ] Redis is configured appropriately
- [ ] AWS S3 buckets are set up (if using S3)
- [ ] Any other third-party services are ready

### Deployment Scripts

- [ ] `render.yaml` is configured correctly
- [ ] `render-build.sh` has the right permissions (`chmod +x`)
- [ ] CI/CD workflow is tested

## Database Migrations

When deploying to production, database migrations will run automatically as part of the API service deployment. The `render-build.sh` script has been configured to:

1. Detect the ORM being used (Prisma or TypeORM)
2. Run the appropriate migration command during the build process
3. Only run migrations for the API service

### Important Database Migration Notes

- **Initial deployment**: The first deployment will set up the schema from scratch
- **Subsequent deployments**: Only new migrations will be applied
- **Backup**: Always back up your database before deploying migrations to production
- **Verification**: Check the Render logs to confirm migrations were applied successfully

If you need to manually run migrations, you can do so using the Render Shell feature:

```bash
# For Prisma
cd apps/api && npx prisma migrate deploy

# For TypeORM
cd apps/api && npx typeorm migration:run
```

## Environment Variables Configuration

Each service requires specific environment variables to function correctly in production. Below is a comprehensive list for each service:

### API Service Environment Variables

| Variable | Description | Example Value | Required |
|----------|-------------|---------------|----------|
| NODE_ENV | Environment setting | `production` | Yes |
| PORT | Port for the API service | `3001` or set by Render | No (Render sets this) |
| DATABASE_URL | PostgreSQL connection string | Set by Render | Yes (Set automatically) |
| AWS_ACCESS_KEY | AWS S3 access key | `your-access-key` | Yes |
| AWS_SECRET_ACCESS_KEY | AWS S3 secret key | `your-secret-key` | Yes |
| AWS_REGION | AWS region | `us-east-1` | Yes |
| AWS_BUCKET_NAME | S3 bucket for storage | `book-finder-prod` | Yes |
| UPLOAD_RATE_TTL | Upload rate limit window (seconds) | `60` | Yes |
| UPLOAD_RATE_LIMIT | Max uploads per TTL window | `3` | Yes |
| DEFAULT_RATE_TTL | API rate limit window (seconds) | `60` | Yes |
| DEFAULT_RATE_LIMIT | Max API calls per TTL window | `20` | Yes |
| REDIS_HOST | Redis host | Set by Render | Yes (Set automatically) |
| REDIS_PORT | Redis port | Set by Render | Yes (Set automatically) |

### Processor Service Environment Variables

| Variable | Description | Example Value | Required |
|----------|-------------|---------------|----------|
| NODE_ENV | Environment setting | `production` | Yes |
| PORT | Port for the processor service | `3002` or set by Render | No (Render sets this) |
| DATABASE_URL | PostgreSQL connection string | Set by Render | Yes (Set automatically) |
| AWS_ACCESS_KEY | AWS S3 access key | `your-access-key` | Yes |
| AWS_SECRET_ACCESS_KEY | AWS S3 secret key | `your-secret-key` | Yes |
| AWS_REGION | AWS region | `us-east-1` | Yes |
| AWS_BUCKET_NAME | S3 bucket for storage | `book-finder-prod` | Yes |
| OPENAI_API_KEY | OpenAI API key | `your-openai-key` | Yes |
| DEEP_SEEK_API_KEY | DeepSeek API key | `your-deepseek-key` | Yes |
| REDIS_HOST | Redis host | Set by Render | Yes (Set automatically) |
| REDIS_PORT | Redis port | Set by Render | Yes (Set automatically) |
| GOOGLE_BOOKS_API_KEY | Google Books API key | `your-google-key` | Yes |

### Web Frontend Environment Variables (Vercel)

| Variable | Description | Example Value | Required |
|----------|-------------|---------------|----------|
| NEXT_PUBLIC_API_URL | URL of the deployed API service | `https://book-finder-api.onrender.com/api` | Yes |

## Setting Up Environment Variables

### On Render

For the API and Processor services, set the environment variables through the Render dashboard:

1. Go to your service in the Render dashboard
2. Click on "Environment"
3. Add each environment variable from the lists above
4. Note that `DATABASE_URL`, `REDIS_HOST`, and `REDIS_PORT` will be set automatically by Render
5. Click "Save Changes"

Sample configuration for environment variables on Render:
```
NODE_ENV=production
AWS_ACCESS_KEY=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
AWS_BUCKET_NAME=book-finder-prod
UPLOAD_RATE_TTL=60
UPLOAD_RATE_LIMIT=3
DEFAULT_RATE_TTL=60
DEFAULT_RATE_LIMIT=20
OPENAI_API_KEY=your-openai-key (for processor only)
DEEP_SEEK_API_KEY=your-deepseek-key (for processor only)
GOOGLE_BOOKS_API_KEY=your-google-key (for processor only)
```

### On Vercel

For the Web frontend, set the environment variables through the Vercel dashboard:

1. Go to your project in the Vercel dashboard
2. Click on "Settings" and then "Environment Variables"
3. Add the `NEXT_PUBLIC_API_URL` variable with the URL of your deployed API service
4. Click "Save"

Sample configuration:
```
NEXT_PUBLIC_API_URL=https://book-finder-api.onrender.com/api
```

## Managing Secrets Securely

Security is critical when deploying applications. Follow these best practices for managing your secrets:

### Secret Environment Variables

The following variables contain sensitive information and should be treated as secrets:

- `AWS_ACCESS_KEY` and `AWS_SECRET_ACCESS_KEY`
- `OPENAI_API_KEY`
- `DEEP_SEEK_API_KEY`
- `GOOGLE_BOOKS_API_KEY`

### Setting up Secrets on Render

In render.yaml, we've marked these variables with `sync: false`, which means:
- Their values won't be displayed in the Render dashboard
- You'll need to set them manually after deployment

To set up secrets:
1. After deploying via Blueprint, go to each service in the Render dashboard
2. Navigate to the Environment section
3. Enter the values for each secret variable
4. Click "Save Changes"

### Using Environment Variable Groups (Alternative)

For shared secrets across multiple services, consider using Render's Environment Variable Groups:

1. In the Render dashboard, go to "Environment Groups"
2. Create a new group (e.g., "book-finder-secrets")
3. Add your secret variables
4. Attach this group to your services

### Rotating Secrets

To maintain security, periodically rotate your secrets:

1. Generate new API keys for your services (AWS, OpenAI, etc.)
2. Update the values in the Render dashboard
3. Verify your application still works correctly

## Deploying the Frontend to Vercel

The Next.js frontend should be deployed to Vercel using the following steps:

1. Create a Vercel account if you don't have one yet
2. Connect your GitHub repository to Vercel
3. Configure the deployment with the following settings:
   - Framework Preset: Next.js
   - Root Directory: `apps/web`
   - Build Command: `cd ../.. && pnpm turbo build --filter=web...`
   - Environment Variables: Set API_URL to your deployed API URL

## Deploying Backend Services to Render

The backend services are configured to deploy to Render using the render.yaml file.

1. Create a Render account if you don't have one yet
2. Connect your GitHub repository to Render
3. Click "Blueprint" and select your repository
4. Render will detect the render.yaml file and set up all your services
5. Ensure all environment variables are properly configured

### Manual Setup (Alternative)

If you prefer to set up services manually:

#### API Service
1. Create a new Web Service on Render
2. Connect to your GitHub repository
3. Set the build command to `./render-build.sh`
4. Set the start command to `cd apps/api && pnpm start:prod`
5. Add environment variables as needed

#### Processor Service
1. Create a new Background Worker on Render
2. Connect to your GitHub repository
3. Set the build command to `./render-build.sh`
4. Set the start command to `cd apps/processor && pnpm start:prod`
5. Add environment variables as needed

#### Database and Redis
1. Create a PostgreSQL database on Render
2. Create a Redis instance on Render
3. Configure the connection details in your API and Processor services

## Monitoring and Troubleshooting

After deployment:
1. Monitor your services using Render's dashboard
2. Check logs for any errors
3. Set up alerts for service failures

## Scaling Considerations

As your application grows:
1. Consider upgrading to paid plans on Render for more resources
2. Set up autoscaling for your web service
3. Optimize database queries and Redis usage
4. Consider implementing a CDN for static assets 