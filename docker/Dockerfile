# Java 21 for Firebase emulators — copied from image (no apt/GPG issues in Docker Desktop)
FROM eclipse-temurin:21-jre-jammy AS java

FROM node:20-bookworm

COPY --from=java /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="${JAVA_HOME}/bin:${PATH}"

RUN npm install -g firebase-tools@latest

WORKDIR /app

# Dependencies install at container start (entrypoint-common.sh) into named volumes.
COPY docker/entrypoint-emulators.sh docker/entrypoint-web.sh docker/entrypoint-seed.sh docker/entrypoint-common.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/entrypoint-*.sh

ENV FIRESTORE_EMULATOR_HOST=127.0.0.1:8081
