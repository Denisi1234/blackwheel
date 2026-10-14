# Black Wheel — production image (React build served by nginx).
# CRA bakes REACT_APP_* at BUILD time, so pass them as --build-arg.
# ---- build ----
FROM node:20-alpine AS build
WORKDIR /app
ARG REACT_APP_SUPABASE_URL=""
ARG REACT_APP_SUPABASE_ANON_KEY=""
ENV REACT_APP_SUPABASE_URL=$REACT_APP_SUPABASE_URL \
    REACT_APP_SUPABASE_ANON_KEY=$REACT_APP_SUPABASE_ANON_KEY \
    CI=true
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY public ./public
COPY src ./src
RUN npm run build
# ---- serve ----
FROM nginx:1.27-alpine
LABEL org.opencontainers.image.title="blackwheel-web" \
      org.opencontainers.image.description="Black Wheel Tire Management System (production nginx)"
COPY k8s/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://localhost/ > /dev/null || exit 1
CMD ["nginx", "-g", "daemon off;"]
