# Atalhos do relay. Nada aqui toca em AWS nem em máquina remota.
.PHONY: help test test-e2e lint deploy-file deploy-full stats logs

RELAY_HOST ?= ubuntu@relay-1.replayja.com.br
SSH_KEY    ?= ~/.ssh/replayja-relay.pem

help:
	@echo "make test        — testes unitarios das partes puras (qualquer SO)"
	@echo "make test-e2e    — teste ponta a ponta com ffmpeg (precisa de Linux)"
	@echo "make lint        — py_compile + shellcheck + systemd-analyze verify"
	@echo "make deploy-file F=rec-server.py — publica UM arquivo, com backup datado"
	@echo "make deploy-full — provisionamento COMPLETO (maquina/unidade nova)"
	@echo "make stats       — /stats do relay, formatado"
	@echo "make logs U=replayja-clip-worker — journal de uma unidade"

# Roda em qualquer lugar: só biblioteca padrão, sem ffmpeg, sem rede.
test:
	python3 -m unittest discover -s tests -v

# Precisa de Linux (ou WSL2/container) com ffmpeg. Ver tests/e2e.sh.
test-e2e:
	sh tests/e2e.sh

lint:
	python3 -m py_compile rec-server.py clip-worker.py auth-sidecar.py \
	  health-report.py tests/mock_api.py tests/test_relay.py
	@command -v shellcheck >/dev/null && shellcheck -s sh record.sh sync-cameras.sh \
	  backup.sh setup.sh retire-camera.sh tests/e2e.sh || echo "(shellcheck ausente — pulado)"
	@command -v systemd-analyze >/dev/null && systemd-analyze verify units/*.timer \
	  || echo "(systemd-analyze ausente — pulado)"
	@command -v terraform >/dev/null && terraform -chdir=infra fmt -check \
	  || echo "(terraform ausente — pulado)"

# ─── PUBLICAR UM ARQUIVO (o caso normal) ───────────────────────────────────
# NUNCA use o setup.sh para isso: ele publica a pasta inteira e leva junto
# tudo o que estiver divergente, em silêncio. Ver README §"Subir uma
# alteração" — no Sentinela foi assim que uma versão velha voltou a produção.
#
# `cp` e não `install`/`mv`: o install(1) TRUNCA o destino no lugar, e um
# processo que estivesse lendo o arquivo veria metade dele.
deploy-file:
	@test -n "$(F)" || (echo "uso: make deploy-file F=rec-server.py"; exit 2)
	@D=$$(date +%Y%m%d-%H%M%S); \
	scp -i $(SSH_KEY) $(F) $(RELAY_HOST):/tmp/$(F).novo && \
	ssh -i $(SSH_KEY) $(RELAY_HOST) " \
	  sudo md5sum /opt/replayja-relay/$(F); \
	  sudo cp -p /opt/replayja-relay/$(F) /opt/replayja-relay/$(F).bak-$$D && \
	  sudo python3 -m py_compile /tmp/$(F).novo 2>/dev/null; \
	  sudo cp /tmp/$(F).novo /opt/replayja-relay/$(F) && \
	  sudo chmod 755 /opt/replayja-relay/$(F) && \
	  sudo md5sum /opt/replayja-relay/$(F)"
	@echo
	@echo "Agora reinicie o que USA esse arquivo (e so isso):"
	@echo "  rec-server.py   -> sudo systemctl restart replayja-recserver"
	@echo "  clip-worker.py  -> sudo systemctl restart replayja-clip-worker"
	@echo "  auth-sidecar.py -> sudo systemctl restart replayja-auth"
	@echo "  record.sh       -> sudo systemctl restart 'replayja-rec@*'  (cada"
	@echo "                     restart custa 30-90 s de lacuna POR CAMERA:"
	@echo "                     nao reinicie a frota por esporte)"

deploy-full:
	scp -i $(SSH_KEY) -r . $(RELAY_HOST):/tmp/relay
	ssh -i $(SSH_KEY) $(RELAY_HOST) 'sudo sh /tmp/relay/setup.sh'
	@echo "mudou o record.sh? o setup NAO reinicia gravador que ja roda:"
	@echo "  ssh $(RELAY_HOST) \"sudo systemctl restart 'replayja-rec@*'\""

stats:
	ssh -i $(SSH_KEY) $(RELAY_HOST) 'sudo curl -s localhost:9900/stats' | python3 -m json.tool

logs:
	@test -n "$(U)" || (echo "uso: make logs U=replayja-clip-worker"; exit 2)
	ssh -i $(SSH_KEY) $(RELAY_HOST) 'sudo journalctl -u $(U) -n 100 --no-pager'
