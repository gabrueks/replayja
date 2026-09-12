###############################################################################
# Armazenamento e entrega dos clipes (decisão G-04 de docs/decisoes.md)
#
#   S3 sa-east-1 (dois buckets privados) + UMA distribuição CloudFront:
#     - padrão  → bucket de clipes, SÓ com URL assinada (key group do app)
#     - *.jpg   → bucket de thumbs/OG, público (preview do WhatsApp)
#   Acesso do app (Vercel) SEM chave estática: federação OIDC da Vercel → IAM role.
#
# Aplicado em 2026-09-12 no CloudShell (mesmo state de main.tf). A chave pública
# de assinatura vem de `storage.auto.tfvars` (não versionado); a privada só existe
# na env CLOUDFRONT_PRIVATE_KEY da Vercel.
###############################################################################

variable "vercel_team_slug" {
  type    = string
  default = "gabriel-bolzis-projects"
}
variable "vercel_project" {
  type    = string
  default = "replayja"
}
variable "cloudfront_public_key_pem" {
  type = string
}

resource "aws_s3_bucket" "clips" {
  bucket = "replayja-clips"
  tags   = { Name = "replayja-clips" }
}
resource "aws_s3_bucket" "thumbs" {
  bucket = "replayja-thumbs"
  tags   = { Name = "replayja-thumbs" }
}

resource "aws_s3_bucket_public_access_block" "clips" {
  bucket                  = aws_s3_bucket.clips.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_public_access_block" "thumbs" {
  bucket                  = aws_s3_bucket.thumbs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "clips" {
  bucket = aws_s3_bucket.clips.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "thumbs" {
  bucket = aws_s3_bucket.thumbs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Rede de segurança da retenção: o app expurga em 90 dias; o S3 garante em 100.
# SEM versionamento de propósito: com ele, DELETE só cria delete marker e o
# takedown da LGPD não apaga nada (legal/fluxo-remocao.md §7.1).
resource "aws_s3_bucket_lifecycle_configuration" "clips" {
  bucket = aws_s3_bucket.clips.id
  rule {
    id     = "expira-100-dias"
    status = "Enabled"
    filter {}
    expiration {
      days = 100
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 2
    }
  }
}
resource "aws_s3_bucket_lifecycle_configuration" "thumbs" {
  bucket = aws_s3_bucket.thumbs.id
  rule {
    id     = "expira-100-dias"
    status = "Enabled"
    filter {}
    expiration {
      days = 100
    }
  }
}

resource "aws_cloudfront_origin_access_control" "s3" {
  name                              = "replayja-s3-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_public_key" "app" {
  name        = "replayja-app-2026-09"
  comment     = "Chave publica para URLs assinadas emitidas pelo app (Vercel)"
  encoded_key = var.cloudfront_public_key_pem
}

resource "aws_cloudfront_key_group" "app" {
  name  = "replayja-app"
  items = [aws_cloudfront_public_key.app.id]
}

resource "aws_cloudfront_distribution" "cdn" {
  enabled         = true
  comment         = "Replay ja - clipes (assinado) e thumbs/OG (publico)"
  price_class     = "PriceClass_All" # ADR §6: bordas no Brasil; a 100 serviria o atleta de Miami
  http_version    = "http2and3"
  is_ipv6_enabled = true

  origin {
    origin_id                = "clips"
    domain_name              = aws_s3_bucket.clips.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }
  origin {
    origin_id                = "thumbs"
    domain_name              = aws_s3_bucket.thumbs.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  default_cache_behavior {
    target_origin_id       = "clips"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = false
    trusted_key_groups     = [aws_cloudfront_key_group.app.id]
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
  }

  # thumb.jpg e og.jpg (mesma chave de objeto, bucket público): sem assinatura.
  ordered_cache_behavior {
    path_pattern           = "*.jpg"
    target_origin_id       = "thumbs"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # cdn.replayja.com.br exige certificado ACM em us-east-1 validado por DNS —
  # fica para quando o DNS do domínio estiver sob controle (G-07).
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = { Name = "replayja-cdn" }
}

data "aws_iam_policy_document" "clips_cf" {
  statement {
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.clips.arn}/*"]
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.cdn.arn]
    }
  }
}
data "aws_iam_policy_document" "thumbs_cf" {
  statement {
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.thumbs.arn}/*"]
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.cdn.arn]
    }
  }
}
resource "aws_s3_bucket_policy" "clips" {
  bucket     = aws_s3_bucket.clips.id
  policy     = data.aws_iam_policy_document.clips_cf.json
  depends_on = [aws_s3_bucket_public_access_block.clips]
}
resource "aws_s3_bucket_policy" "thumbs" {
  bucket     = aws_s3_bucket.thumbs.id
  policy     = data.aws_iam_policy_document.thumbs_cf.json
  depends_on = [aws_s3_bucket_public_access_block.thumbs]
}

# Federação OIDC da Vercel: o app assume esta role com o token do próprio deploy.
# Nenhuma access key da AWS existe em lugar nenhum.
data "tls_certificate" "vercel" {
  url = "https://oidc.vercel.com/${var.vercel_team_slug}"
}

resource "aws_iam_openid_connect_provider" "vercel" {
  url             = "https://oidc.vercel.com/${var.vercel_team_slug}"
  client_id_list  = ["https://vercel.com/${var.vercel_team_slug}"]
  thumbprint_list = [data.tls_certificate.vercel.certificates[0].sha1_fingerprint]
}

data "aws_iam_policy_document" "vercel_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.vercel.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "oidc.vercel.com/${var.vercel_team_slug}:aud"
      values   = ["https://vercel.com/${var.vercel_team_slug}"]
    }
    condition {
      test     = "StringLike"
      variable = "oidc.vercel.com/${var.vercel_team_slug}:sub"
      values   = ["owner:${var.vercel_team_slug}:project:${var.vercel_project}:environment:*"]
    }
  }
}

resource "aws_iam_role" "vercel_app" {
  name               = "replayja-vercel-app"
  assume_role_policy = data.aws_iam_policy_document.vercel_trust.json
}

data "aws_iam_policy_document" "vercel_app" {
  statement {
    actions   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:AbortMultipartUpload"]
    resources = ["${aws_s3_bucket.clips.arn}/*", "${aws_s3_bucket.thumbs.arn}/*"]
  }
  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.clips.arn, aws_s3_bucket.thumbs.arn]
  }
  statement {
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
    resources = [aws_cloudfront_distribution.cdn.arn]
  }
}

resource "aws_iam_role_policy" "vercel_app" {
  name   = "replayja-storage"
  role   = aws_iam_role.vercel_app.id
  policy = data.aws_iam_policy_document.vercel_app.json
}

output "storage_bucket" { value = aws_s3_bucket.clips.bucket }
output "storage_public_bucket" { value = aws_s3_bucket.thumbs.bucket }
output "cloudfront_domain" { value = aws_cloudfront_distribution.cdn.domain_name }
output "cloudfront_distribution_id" { value = aws_cloudfront_distribution.cdn.id }
output "cloudfront_key_pair_id" { value = aws_cloudfront_public_key.app.id }
output "vercel_app_role_arn" { value = aws_iam_role.vercel_app.arn }
