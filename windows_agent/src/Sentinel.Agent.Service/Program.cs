using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Sentinel.Agent.Core.Security;
using Sentinel.Agent.Service;

var builder = Host.CreateApplicationBuilder(args);

builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "SentinelSOCAgent";
});

var logDir = Path.Combine(DpapiIdentityStore.GetDefaultDataDirectory(), "logs");
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddProvider(new RollingJsonFileLoggerProvider(logDir));

if (OperatingSystem.IsWindows())
{
    builder.Logging.AddEventLog(settings =>
    {
        settings.SourceName = "SentinelSOCAgent";
        settings.LogName = "Application";
    });
}

builder.Services.AddHostedService<AgentWorker>();

var host = builder.Build();
host.Run();
