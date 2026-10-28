FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY src ./src
COPY public ./public
EXPOSE 3000
USER node
CMD ["node", "src/server.js"]
