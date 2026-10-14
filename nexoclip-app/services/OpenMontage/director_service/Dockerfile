# AI Director service. Build context: nexoclip-app/services/OpenMontage.
# Only the service and the OpenMontage skills it reads are copied; state lives in
# Postgres and the OpenAI key comes from the environment (never baked in).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

# A font for the captions drawn into the render.
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*

COPY director_service/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY LICENSE ./LICENSE
COPY skills ./skills
# Seedance 2.5 prompting (our video model) lives with the provider skills; only this one is needed.
COPY .agents/skills/seedance-2-5 ./.agents/skills/seedance-2-5
COPY director_service ./director_service

RUN useradd --uid 1001 --no-create-home director
USER 1001:1001

# Bind IPv4 (0.0.0.0): Railway's healthcheck connects over IPv4 and its private network
# reaches it too. `::` would be IPv6-only under asyncio. PORT defaults to 4760.
ENV DIRECTOR_HOST=0.0.0.0 PORT=4760
EXPOSE 4760
CMD ["sh", "-c", "exec python -m uvicorn director_service.app:app --host \"$DIRECTOR_HOST\" --port \"$PORT\""]
