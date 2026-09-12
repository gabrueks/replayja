variable "regiao" {
  description = "Região AWS. sa-east-1 (São Paulo) porque a latência para a arena importa e porque a EC2 não cobra ingresso — que é 50× o nosso egresso (ADR §3)."
  type        = string
  default     = "sa-east-1"
}

variable "ambiente" {
  description = "piloto | producao"
  type        = string
  default     = "piloto"
}

variable "nome" {
  description = "Nome do relay. Vira Name das tags e casa com o RELAY_ID do rec.env."
  type        = string
  default     = "replayja-relay-1"
}

variable "tipo_instancia" {
  description = <<-EOT
    t4g.medium no piloto enxuto (ADR §9). TROCAR POR c7g.large quando qualquer
    uma destas acontecer:
      1. CPUCreditBalance cair ao longo de um dia inteiro em vez de recuperar
         à noite (o alarme deste módulo avisa);
      2. a SEXTA câmera entrar no mesmo relay, ou passar de ~300 clipes/dia;
      3. qualquer recodificação contínua (sub-stream, IA local).
  EOT
  type        = string
  default     = "t4g.medium"
}

variable "gb_raiz" {
  description = "gp3 para SO + índice SQLite. O índice precisa de IOPS; por isso não fica no st1."
  type        = number
  default     = 60
}

variable "gb_midia" {
  description = <<-EOT
    st1 para a mídia. 250 GB cobrem o piloto enxuto: 4 câmeras a 3 Mbps, 12 h
    de operação por dia, 3 dias de retenção ≈ 195 GB, com folga para a poda por
    disco (DISK_HIGH 85%) não começar a cortar sozinha.
    MÍNIMO do tipo st1: 125 GB. Crescer depois é `pvcreate` + `vgextend` +
    `lvextend -r`, sem parar gravador nenhum.
  EOT
  type        = number
  default     = 250

  validation {
    condition     = var.gb_midia >= 125
    error_message = "st1 exige no minimo 125 GB."
  }
}

variable "porta_rtmp_min" {
  description = "Início da faixa de ingest RTMP. Precisa bater com RTMP_PORTS_OPEN no rec.env e com a faixa que a API sorteia."
  type        = number
  default     = 19350
}

variable "porta_rtmp_max" {
  description = "Fim da faixa. O contrato (openapi.yaml) permite até 19599; abrimos 50 portas porque acima de 24 câmeras a ADR §2 manda trocar por MediaMTX em porta única, não esticar a faixa."
  type        = number
  default     = 19399
}

variable "cidrs_ssh" {
  description = <<-EOT
    Quem pode abrir SSH. SEM PADRÃO de propósito: um `0.0.0.0/0` aqui seria
    exatamente o tipo de linha que ninguém revisa depois. Preencha com o IP
    fixo do escritório ou o /32 de casa — e se ele for dinâmico, prefira SSM
    Session Manager a abrir a porta para o mundo.
  EOT
  type        = list(string)
  default     = [] # padrão: porta 22 fechada; administração por SSM Session Manager
}

variable "nome_chave_ssh" {
  description = "Key pair já existente na região (opcional; vazio = sem SSH, só SSM). Criar key pair pelo Terraform gravaria a chave privada no state."
  type        = string
  default     = ""
}

variable "email_alarme" {
  description = "E-mail para os alarmes de CPU/crédito. Vazio desliga SNS e alarmes."
  type        = string
  default     = ""
}
