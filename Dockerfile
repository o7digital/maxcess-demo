FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY scripts ./scripts
COPY migrations ./migrations
COPY public ./public
USER node
EXPOSE 3000
CMD ["node", "server/index.js"]
