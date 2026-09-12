###############################################################################
# Relay do Replay já — infraestrutura AWS (sa-east-1)
#
# ⚠️ NADA AQUI FOI APLICADO. Este diretório está pronto para `terraform plan`,
#    e o `apply` é decisão do Gabriel — ele cria recursos que geram custo
#    (instância, volumes, IP elástico). Ver relay/README.md §"Subir a infra".
#
# O QUE ISTO CRIA, e por quê cada escolha:
#
#   EC2 t4g.medium (Graviton/arm64) em sa-east-1, crédito `standard`
#       Graviton porque ffmpeg e Python rodam nativos e é ~34% mais barato
#       pelo mesmo trabalho. `t4g` e não `c7g` porque o piloto enxuto cabe no
#       baseline (ADR §9: ~0,34 de 0,40 vCPU sustentados) — MAS ver a nota
#       sobre crédito abaixo, que é a parte que importa.
#
#   gp3 60 GB (raiz: SO + índice SQLite)  +  st1 250 GB (mídia)
#       Dois volumes porque as cargas são opostas: o índice precisa de IOPS
#       (gp3) e o vídeo é escrita sequencial (st1, 43% mais barato por GB).
#
#   Elastic IP
#       O `stream.replayja.com.br` fica DIGITADO DENTRO DE CADA CÂMERA
#       instalada. Se a instância morrer, o IP muda de máquina e as câmeras
#       reconectam sozinhas — sem ninguém ir à quadra redigitar nada.
#
#   Security Group: 443 (Caddy), 19350–19399 (RTMP), 22 restrito
#       A FAIXA inteira de RTMP, não uma porta. No Sentinela, em 08/09/2026,
#       só a 19350 estava aberta: a 19351 e a 1935 respondiam com pacote
#       descartado, e o sintoma de fora é um timeout de 8 s que não diz nada.
#       Custou meio dia.
###############################################################################

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls" # thumbprint do OIDC da Vercel (storage.tf)
      version = "~> 4.0"
    }
  }
}

provider "aws" {
  region = var.regiao

  default_tags {
    tags = {
      Project     = "replayja"
      Component   = "relay"
      Environment = var.ambiente
      ManagedBy   = "terraform"
      Repo        = "replay/relay/infra"
    }
  }
}

# Ubuntu 24.04 LTS arm64, oficial da Canonical. Filtro por nome e não AMI fixa:
# AMI fixa envelhece e obriga a `terraform apply` só para pegar patch de
# kernel. O `most_recent` muda o id quando a Canonical publica uma nova — por
# isso `ignore_changes` no recurso, para que isso NÃO recrie a instância
# sozinho num apply de rotina.
data "aws_ami" "ubuntu_arm64" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

data "aws_vpc" "padrao" {
  default = true
}

data "aws_subnets" "padrao" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.padrao.id]
  }
}

###############################################################################
# Rede
###############################################################################

resource "aws_security_group" "relay" {
  name        = "${var.nome}-sg"
  description = "Relay do Replay ja: HTTPS, ingest RTMP e SSH restrito"
  vpc_id      = data.aws_vpc.padrao.id

  tags = { Name = "${var.nome}-sg" }
}

resource "aws_vpc_security_group_ingress_rule" "https" {
  security_group_id = aws_security_group.relay.id
  description       = "Caddy: playlists, /clip, /thumb, /stats, /jobs"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "http_acme" {
  security_group_id = aws_security_group.relay.id
  # O Caddy precisa da 80 para o desafio HTTP-01 do Let's Encrypt na PRIMEIRA
  # emissão e nas renovações. Fechar a 80 aqui é o jeito clássico de descobrir,
  # 60 dias depois, que o certificado não renova.
  description = "ACME HTTP-01 (renovacao do certificado)"
  cidr_ipv4   = "0.0.0.0/0"
  from_port   = 80
  to_port     = 80
  ip_protocol = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "rtmp" {
  security_group_id = aws_security_group.relay.id
  # A FAIXA, não uma porta: `ffmpeg -listen` atende UMA conexao, entao e uma
  # porta por camera. 50 portas = 50 cameras = ~12 arenas de 4 quadras, bem
  # acima do limiar de 24 cameras em que a ADR §2 manda trocar por MediaMTX.
  description = "Ingest RTMP das cameras (uma porta por camera)"
  cidr_ipv4   = "0.0.0.0/0"
  from_port   = var.porta_rtmp_min
  to_port     = var.porta_rtmp_max
  ip_protocol = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "ssh" {
  for_each = toset(var.cidrs_ssh)

  security_group_id = aws_security_group.relay.id
  description       = "SSH administrativo"
  cidr_ipv4         = each.value
  from_port         = 22
  to_port           = 22
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "tudo" {
  security_group_id = aws_security_group.relay.id
  # Sem apostrofo: a API do EC2 rejeita "'" em descricao de regra (aprendido no primeiro apply).
  description       = "Saida livre: API, S3, apt, Lets Encrypt"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

###############################################################################
# Acesso administrativo por SSM Session Manager (sem porta 22, sem key pair)
#
# O Ubuntu 24.04 da Canonical já traz o agente SSM (snap). Com este perfil, o
# `aws ssm start-session --target <instance_id>` abre um shell auditado pelo
# CloudTrail, sem IP fixo de casa, sem chave privada para guardar. SSH por
# key pair continua possível (variáveis `cidrs_ssh` e `nome_chave_ssh`), mas é
# opcional — e o padrão é não abrir.
###############################################################################

resource "aws_iam_role" "relay" {
  name = "${var.nome}-ec2"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.relay.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "relay" {
  name = "${var.nome}-ec2"
  role = aws_iam_role.relay.name
}

###############################################################################
# Instância
###############################################################################

resource "aws_instance" "relay" {
  ami                  = data.aws_ami.ubuntu_arm64.id
  instance_type        = var.tipo_instancia
  subnet_id            = data.aws_subnets.padrao.ids[0]
  key_name             = var.nome_chave_ssh != "" ? var.nome_chave_ssh : null
  iam_instance_profile = aws_iam_instance_profile.relay.name

  vpc_security_group_ids = [aws_security_group.relay.id]

  # ─── MODO DE CRÉDITO: `standard`, NUNCA `unlimited` ──────────────────────
  # No padrão da AWS (`unlimited`), estourar o baseline NÃO estrangula: cobra
  # US$ 0,05 por vCPU-hora excedente, em silêncio, e o primeiro aviso é a
  # fatura. Em `standard` a máquina desacelera e o alarme de crédito dispara —
  # o que é observável e barato. É a diferença entre a lição do Sentinela (53%
  # de steal, descoberto lendo /proc/stat à mão) ser repetida ou não.
  credit_specification {
    cpu_credits = "standard"
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = var.gb_raiz
    encrypted   = true
    tags        = { Name = "${var.nome}-raiz" }
  }

  metadata_options {
    http_tokens   = "required" # IMDSv2 obrigatorio
    http_endpoint = "enabled"
  }

  monitoring = true # CloudWatch detalhado: e de la que sai o CPUCreditBalance

  tags = { Name = var.nome }

  lifecycle {
    # Recriar a instância apaga o disco de mídia junto e derruba as câmeras.
    # Uma AMI nova publicada pela Canonical NÃO é motivo para isso acontecer
    # num apply de rotina.
    ignore_changes = [ami]
  }
}

###############################################################################
# Volume de mídia (st1) — separado da instância de propósito
#
# Recurso à parte, e não `ebs_block_device` dentro da instância: assim ele
# SOBREVIVE a um `terraform taint` da máquina. O acervo de vídeo não pode
# depender do ciclo de vida do SO.
###############################################################################

resource "aws_ebs_volume" "midia" {
  availability_zone = aws_instance.relay.availability_zone
  size              = var.gb_midia
  # st1 e nao gp3: US$ 0,086/GB-mes contra 0,152, e gravacao de video e
  # exatamente a carga sequencial para a qual o st1 existe. A 250 GB ele
  # entrega ~12 MB/s de baseline; 4 cameras a 3 Mbps escrevem ~1,5 MB/s.
  # ATENCAO: st1 tem tamanho MINIMO de 125 GB.
  type      = "st1"
  encrypted = true

  tags = { Name = "${var.nome}-midia" }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_volume_attachment" "midia" {
  device_name = "/dev/sdf"
  volume_id   = aws_ebs_volume.midia.id
  instance_id = aws_instance.relay.id
  # NAO force o detach: com os gravadores escrevendo, arrancar o volume
  # corrompe o xfs.
  force_detach = false
}

###############################################################################
# Elastic IP
###############################################################################

resource "aws_eip" "relay" {
  instance = aws_instance.relay.id
  domain   = "vpc"

  tags = { Name = "${var.nome}-eip" }
}

###############################################################################
# Alarme de crédito de CPU
#
# O sinal MAIS CONFIÁVEL de que a t4g.medium deixou de servir (ADR §9) é o
# `CPUCreditBalance` cair ao longo de um dia inteiro em vez de se recuperar à
# noite. Ele vem de graça no CloudWatch; o que custava era ninguém olhar.
###############################################################################

resource "aws_cloudwatch_metric_alarm" "credito_cpu" {
  count = var.email_alarme == "" ? 0 : 1

  alarm_name          = "${var.nome}-credito-cpu-baixo"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 6
  metric_name         = "CPUCreditBalance"
  namespace           = "AWS/EC2"
  period              = 3600
  statistic           = "Average"
  threshold           = 100
  alarm_description   = "Credito de CPU nao esta recuperando: hora de trocar por c7g.large (ADR §9)"
  dimensions          = { InstanceId = aws_instance.relay.id }
  alarm_actions       = [aws_sns_topic.alarmes[0].arn]
}

resource "aws_cloudwatch_metric_alarm" "disco_raiz" {
  count = var.email_alarme == "" ? 0 : 1

  alarm_name          = "${var.nome}-cpu-alta"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "CPU sustentada acima de 80%: gravador em risco de perder segmento"
  dimensions          = { InstanceId = aws_instance.relay.id }
  alarm_actions       = [aws_sns_topic.alarmes[0].arn]
}

resource "aws_sns_topic" "alarmes" {
  count = var.email_alarme == "" ? 0 : 1
  name  = "${var.nome}-alarmes"
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.email_alarme == "" ? 0 : 1
  topic_arn = aws_sns_topic.alarmes[0].arn
  protocol  = "email"
  endpoint  = var.email_alarme
}
