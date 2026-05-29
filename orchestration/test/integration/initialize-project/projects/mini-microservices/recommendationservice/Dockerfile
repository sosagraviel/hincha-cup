# syntax=docker/dockerfile:1.6
FROM python:3.12-slim AS builder
WORKDIR /src
RUN pip install poetry==1.8.3
COPY pyproject.toml poetry.lock ./
RUN poetry config virtualenvs.create false && poetry install --no-root --without dev
COPY . .

FROM gcr.io/distroless/python3-debian12 AS runtime
WORKDIR /app
COPY --from=builder /usr/local/lib/python3.12 /usr/local/lib/python3.12
COPY --from=builder /src /app
EXPOSE 8080
ENTRYPOINT ["python", "recommendation_server.py"]
