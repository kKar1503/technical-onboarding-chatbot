# fck-nat: Cost-effective NAT instance (~$3/mo vs $32/mo for NAT Gateway)
# https://fck-nat.dev

module "fck_nat" {
  source = "RaJiska/fck-nat/aws"

  name      = "${local.name_prefix}-nat"
  vpc_id    = aws_vpc.main.id
  subnet_id = aws_subnet.public_a.id

  instance_type = "t4g.nano"
  ha_mode       = true

  update_route_tables = true
  route_tables_ids = {
    private = aws_route_table.private.id
  }

  tags = local.common_tags
}
