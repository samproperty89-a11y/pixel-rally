FROM node:24-alpine
WORKDIR /app
COPY package.json server.mjs ./
COPY public ./public
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.mjs"]
