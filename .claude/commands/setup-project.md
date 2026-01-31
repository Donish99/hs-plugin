# Setup Project

Initialize the NestJS project with all required dependencies and structure.

## Instructions

Execute the following setup:

### 1. Initialize NestJS Project
```bash
nest new hubspot-dormant-leads --package-manager npm
cd hubspot-dormant-leads
```

### 2. Install Dependencies
```bash
# HubSpot
npm install @hubspot/api-client

# AI
npm install @anthropic-ai/sdk

# Email & SMS
npm install @sendgrid/mail twilio

# Database
npm install @nestjs/typeorm typeorm pg

# Redis & Queue
npm install @nestjs/bull bull ioredis @nestjs/cache-manager cache-manager

# Utilities
npm install class-validator class-transformer
npm install @nestjs/config
npm install crypto-js
npm install uuid

# Dev dependencies
npm install -D @types/bull @types/cache-manager @types/crypto-js
```

### 3. Generate Modules
```bash
nest g module hubspot
nest g module campaigns
nest g module ai
nest g module outreach
nest g module analytics
nest g module settings
```

### 4. Generate Services
```bash
nest g service hubspot/services/oauth --flat
nest g service hubspot/services/contacts --flat
nest g service hubspot/services/webhooks --flat
nest g service campaigns/services/dormancy --flat
nest g service campaigns/services/scanner --flat
nest g service ai/services/generator --flat
nest g service ai/services/classifier --flat
nest g service outreach/services/email --flat
nest g service outreach/services/sms --flat
```

### 5. Create Config Files
- Create `.env.example` with all required variables
- Set up TypeORM configuration
- Configure Redis connection

### 6. Update Milestone
After setup, mark items complete in `milestones/01-foundation.md`

## Run this command to begin project setup.
