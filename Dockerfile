FROM node:22-alpine
LABEL org.opencontainers.image.version="1.3.0"
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["node", "server.js"]
