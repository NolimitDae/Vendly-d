# Base image
FROM node:20

# Set working directory
WORKDIR /usr/src/app

# Copy package.json and lock file
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Copy the .env and .env.development files
COPY .env ./

# Build the Next.js application
RUN npm run build

# Expose the port on which Next.js runs
EXPOSE 3000

# Start the Next.js application
CMD ["npm", "start"]
