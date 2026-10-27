# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json .npmrc ./
RUN npm ci
COPY . .
ARG VITE_BOT_USERNAME=taxizakRObot
ENV VITE_BOT_USERNAME=$VITE_BOT_USERNAME
RUN npm run build

# ---------- runtime: statik sayt + API'ga proxy ----------
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
