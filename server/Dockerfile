FROM node:26-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY index.js ./
COPY src ./src

ENV PORT=4000
ENV DATA_DIR=/data
VOLUME ["/data"]

EXPOSE 4000

CMD ["node", "index.js"]
