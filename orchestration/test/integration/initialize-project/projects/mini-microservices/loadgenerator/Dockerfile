# syntax=docker/dockerfile:1.6
FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir locust==2.30.0
COPY locustfile.py /app/
ENTRYPOINT ["locust", "--headless", "-u", "10", "-r", "1"]
