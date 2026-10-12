# AI Director service. Build context: nexoclip-app/services/OpenMontage.
# Only the service and the OpenMontage skills it reads are copied; state lives in
# Postgres and the OpenAI key comes from the environment (never baked in).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY director_service/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY LICENSE ./LICENSE
COPY skills ./skills
COPY director_service ./director_service

RUN useradd --uid 1001 --no-create-home director
USER 1001:1001

# DIRECTOR_HOST=:: on Railway (its private network is IPv6); PORT defaults to 4760.
ENV DIRECTOR_HOST=0.0.0.0 PORT=4760
EXPOSE 4760
CMD ["sh", "-c", "exec python -m uvicorn director_service.app:app --host \"$DIRECTOR_HOST\" --port \"$PORT\""]
