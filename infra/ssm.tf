resource "aws_ssm_parameter" "openai_api_key" {
  name  = "/plex/OPENAI_API_KEY"
  type  = "SecureString"
  value = var.openai_api_key
}

resource "aws_ssm_parameter" "tavily_api_key" {
  name  = "/plex/TAVILY_API_KEY"
  type  = "SecureString"
  value = var.tavily_api_key
}

resource "aws_ssm_parameter" "session_secret_key" {
  name  = "/plex/SESSION_SECRET_KEY"
  type  = "SecureString"
  value = var.session_secret_key
}

resource "aws_ssm_parameter" "plex_client_identifier" {
  name  = "/plex/PLEX_CLIENT_IDENTIFIER"
  type  = "SecureString"
  value = var.plex_client_identifier
}
