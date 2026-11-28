using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using Sentinel.Agent.Core.Models;

namespace Sentinel.Agent.Core.Security;

public sealed class DpapiIdentityStore
{
    private readonly string _identityFilePath;
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("SentinelSOC-Agent-Identity-v1");

    public DpapiIdentityStore(string? baseDirectory = null)
    {
        var dir = baseDirectory ?? GetDefaultDataDirectory();
        Directory.CreateDirectory(dir);
        _identityFilePath = Path.Combine(dir, "identity.dpapi");
    }

    public static string GetDefaultDataDirectory()
    {
        var programData = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
        return Path.Combine(programData, "SentinelSOC");
    }

    public static void SecureDirectoryPermissions(string directoryPath)
    {
        Directory.CreateDirectory(directoryPath);
        if (!OperatingSystem.IsWindows()) return;

        try
        {
            var dirInfo = new DirectoryInfo(directoryPath);
            var security = new DirectorySecurity();
            security.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);

            var systemSid = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);
            var adminsSid = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null);
            var localServiceSid = new SecurityIdentifier(WellKnownSidType.LocalServiceSid, null);

            security.AddAccessRule(new FileSystemAccessRule(
                systemSid, FileSystemRights.FullControl,
                InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
                PropagationFlags.None, AccessControlType.Allow));

            security.AddAccessRule(new FileSystemAccessRule(
                adminsSid, FileSystemRights.FullControl,
                InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
                PropagationFlags.None, AccessControlType.Allow));

            security.AddAccessRule(new FileSystemAccessRule(
                localServiceSid, FileSystemRights.Modify,
                InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
                PropagationFlags.None, AccessControlType.Allow));

            dirInfo.SetAccessControl(security);
        }
        catch (UnauthorizedAccessException)
        {
            // Non-admin test runs cannot rewrite SYSTEM ACLs; caller handles least-privilege directories.
        }
    }

    public AgentIdentity? Load()
    {
        if (!File.Exists(_identityFilePath))
            return null;

        try
        {
            var protectedBytes = File.ReadAllBytes(_identityFilePath);
            var rawBytes = ProtectedData.Unprotect(protectedBytes, Entropy, DataProtectionScope.LocalMachine);
            var json = Encoding.UTF8.GetString(rawBytes);
            return JsonSerializer.Deserialize<AgentIdentity>(json);
        }
        catch
        {
            return null;
        }
    }

    public void Save(AgentIdentity identity)
    {
        var dir = Path.GetDirectoryName(_identityFilePath)!;
        Directory.CreateDirectory(dir);

        var json = JsonSerializer.Serialize(identity);
        var rawBytes = Encoding.UTF8.GetBytes(json);
        var protectedBytes = ProtectedData.Protect(rawBytes, Entropy, DataProtectionScope.LocalMachine);

        var tempPath = _identityFilePath + ".tmp";
        File.WriteAllBytes(tempPath, protectedBytes);
        File.Move(tempPath, _identityFilePath, overwrite: true);
    }

    public void Delete()
    {
        if (File.Exists(_identityFilePath))
            File.Delete(_identityFilePath);
    }
}
