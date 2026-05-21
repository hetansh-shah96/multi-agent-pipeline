FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm prune --omit=dev
EXPOSE 3000
CMD ["node", "index.js"]
