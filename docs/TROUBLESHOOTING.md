# JellyOS Troubleshooting Guide

## Common Issues

### Connection Errors

**RPC Connection Failed**
```
Error: Failed to connect to RPC endpoint
```
- Check `ALCHEMY_KEY` in `.env.local`
- Verify RPC URLs in config
- Ensure network connectivity
- Check if rate limits are exceeded

**Redis Connection Failed**
```
Error: Redis connection refused
```
- Ensure Redis is running: `redis-cli ping`
- Check `REDIS_URL` in `.env.local`
- Verify Redis is not behind a firewall

### Agent Issues

**Agent Not Responding**
```
Error: Agent task timeout
```
- Check agent heartbeat in logs
- Restart the agent: `jellyos stop && jellyos start`
- Increase `agent.taskTimeout` in config
- Verify system resources (memory, CPU)

**Sentiment Agent Failing**
```
Error: Failed to fetch sentiment data
```
- Check Twitter API credentials
- Verify news source URLs are accessible
- Reduce the number of tracked symbols

**Blockchain Agent Errors**
```
Error: Unknown chain
```
- Verify chain name in supported list
- Check `blockchain.chains` in config
- Add RPC endpoint for custom chain

### Trading Issues

**Order Rejected**
```
Error: Position exceeds risk limits
```
- Reduce position size
- Check `maxPositionSize` in config
- Verify daily loss limit not exceeded
- Check portfolio drawdown limits

**High Slippage**
```
Warning: Order filled with high slippage
```
- Reduce trade size
- Increase `maxSlippage` in config
- Trade on more liquid pairs
- Use limit orders instead of market

**Position Not Opening**
```
Error: Cannot open position - risk check failed
```
- Check concentration limits
- Reduce existing positions
- Verify portfolio has available cash
- Check leverage limits

### Performance Issues

**High Memory Usage**
- Reduce `agent.memoryLimit` in config
- Decrease task queue size
- Reduce context store TTL
- Limit historical data retention

**Slow Predictions**
- Reduce `prediction.models` in config
- Decrease `prediction.historyWindow`
- Limit symbols being tracked
- Check Redis cache is working

**CLI Unresponsive**
- Check if JellyOS process is running
- Check logs for errors
- Restart the CLI: `jellyos stop && jellyos start`

### Configuration Issues

**Config Not Loading**
```
Error: Config validation failed
```
- Check JSON syntax in config file
- Verify all required fields present
- Ensure file permissions are correct
- Run `jellyos setup` to regenerate

**Environment Variables Not Applied**
- Restart JellyOS after changing `.env.local`
- Verify variable names (case-sensitive)
- Check for conflicting config values
- Run `source .env.local` to reload

## Debug Mode

Enable debug logging:
```bash
export LOG_LEVEL=debug
jellyos start
```

## Health Check

Run the health check script:
```bash
./scripts/healthcheck.sh
```

## Logs

View logs:
```bash
tail -f logs/jellyos.log           # Application logs
tail -f logs/jellyos-error.log     # Error logs only
```

## Reset

To reset JellyOS:
```bash
jellyos stop
rm -rf data/*
rm -rf logs/*
jellyos setup
jellyos start
```