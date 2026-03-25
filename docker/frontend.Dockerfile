FROM node:22-alpine

WORKDIR /app

COPY frontend/package.json frontend/tsconfig.json frontend/vite.config.ts frontend/index.html /app/
COPY frontend/src /app/src

RUN npm install

EXPOSE 5173

CMD ["npm", "run", "dev"]
