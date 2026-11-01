FROM node:24-bookworm-slim
ENV NODE_ENV=production SPAZI_HOST=0.0.0.0 SPAZI_PORT=8766 SPAZI_DB=/data/spazi.sqlite SPAZI_BACKUP_DIR=/backups
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node dist ./dist
RUN mkdir /data /backups && chown node:node /data /backups
USER node
EXPOSE 8766
CMD ["node", "server/server.mjs"]
