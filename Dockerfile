# Use a lightweight official Node.js runtime as the parent image
FROM node:20-alpine

# Prevent node-gyp or build issues
RUN apk add --no-cache libc6-compat

# Set the working directory inside the container
WORKDIR /app

# Copy dependency configuration files
COPY package*.json ./

# Install only production dependencies for optimal image size and security
RUN npm ci --only=production && npm cache clean --force

# Copy application source and configuration files
COPY index.js swagger.json master_profile.md ./

# Define environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Expose the server's listening port
EXPOSE 8080

# Run the web service using the standard npm start script
CMD ["npm", "start"]
