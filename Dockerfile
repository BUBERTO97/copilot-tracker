# Use Node 22 which supports native TypeScript type stripping
FROM node:22-slim

WORKDIR /app

# Install build dependencies if any (none needed for slim usually)
# RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for the build step)
RUN npm install

# Copy the rest of the application
COPY . .

# Build the frontend assets
RUN npm run build

# Set environment to production
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
