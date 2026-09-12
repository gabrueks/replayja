output "ip_publico" {
  description = "Elastic IP. É o valor de A para stream.replayja.com.br E para relay-1.replayja.com.br."
  value       = aws_eip.relay.public_ip
}

output "instance_id" {
  value = aws_instance.relay.id
}

output "volume_midia" {
  value = aws_ebs_volume.midia.id
}

output "dns_a_criar" {
  description = "Os dois registros DNS que precisam existir ANTES de rodar o setup.sh (o Caddy só emite o certificado depois que relay-1 resolve)."
  value = {
    "relay-1.replayja.com.br" = aws_eip.relay.public_ip
    "stream.replayja.com.br"  = aws_eip.relay.public_ip
  }
}

output "proximo_passo" {
  value = <<-EOT

    1. Crie os dois registros A acima e espere propagar.
    2. Abra um shell na máquina SEM SSH (CloudShell ou CLI com o plugin Session Manager):
       aws ssm start-session --region ${var.regiao} --target ${aws_instance.relay.id}
       (o agente SSM leva ~1–2 min para registrar após o boot)
    3. Dentro da sessão, copie o repo (git clone do relay/ ou `aws s3 cp` de um tarball) e:
       sudo install -d -m 700 /etc/replayja
       sudo install -m 600 relay/rec.env.example /etc/replayja/rec.env
       sudo nano /etc/replayja/rec.env      # os quatro segredos
       sudo sh relay/setup.sh
    4. Do SEU computador, conferir a FAIXA (não só a primeira porta):
       nc -vz ${aws_eip.relay.public_ip} 19350
       nc -vz ${aws_eip.relay.public_ip} 19351
    (SSH por key pair continua opcional: preencha cidrs_ssh e nome_chave_ssh.)
  EOT
}
