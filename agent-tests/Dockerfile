FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm prune --production
EXPOSE 3000
CMD ["node", "index.js"]
