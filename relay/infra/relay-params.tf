###############################################################################
# Segredos do relay via SSM Parameter Store
#
# O `rec.env` (RELAY_KEY, RELAY_TOKEN, RELAY_TOKEN_SECRET…) nunca passa por
# git nem por user-data: fica em `/replayja/<nome>/rec.env` como SecureString
# e a instância o busca com a própria role na instalação (setup por SSM).
# Rotacionar segredo = `put-parameter --overwrite` + reinstalar o rec.env.
###############################################################################

data "aws_caller_identity" "atual" {}

data "aws_iam_policy_document" "relay_params" {
  statement {
    actions   = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = ["arn:aws:ssm:${var.regiao}:${data.aws_caller_identity.atual.account_id}:parameter/replayja/${var.nome}/*"]
  }
  statement {
    # Chave gerenciada aws/ssm: o decrypt só é permitido via o próprio serviço.
    actions   = ["kms:Decrypt"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${var.regiao}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "relay_params" {
  name   = "${var.nome}-params"
  role   = aws_iam_role.relay.id
  policy = data.aws_iam_policy_document.relay_params.json
}
