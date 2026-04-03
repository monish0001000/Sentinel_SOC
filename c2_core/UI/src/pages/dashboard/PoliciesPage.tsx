import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Plus, Trash2, ArrowRight, Save, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const API_URL = "http://localhost:8000";

interface Policy {
    id: string;
    name: string;
    source_zone: string;
    dest_zone: string;
    source_ip: string;
    app: string;
    process_name: string;
    action: "allow" | "deny";
    hits: number;
}

import { useWebSocket } from '@/hooks/useWebSocket';

const PoliciesPage = () => {
    const { firewall } = useWebSocket();
    const [policies, setPolicies] = useState<Policy[]>([]);
    const [isAdding, setIsAdding] = useState(false);
    const [newPolicy, setNewPolicy] = useState({
        name: "New Policy",
        source_zone: "Any",
        dest_zone: "Any",
        source_ip: "Any",
        app: "Any",
        process_name: "Any",
        action: "deny"
    });

    const fetchPolicies = async () => {
        try {
            const token = localStorage.getItem("sentinel_token");
            if (!token) {
                window.location.href = "/login";
                return;
            }

            const res = await fetch(`${API_URL}/firewall/policies`, {
                headers: { "Authorization": `Bearer ${token}` }
            });

            if (res.status === 401) {
                window.location.href = "/login";
                return;
            }

            if (!res.ok) throw new Error("Failed to fetch policies");
            const data = await res.json();
            if (Array.isArray(data)) {
                setPolicies(data);
            } else {
                setPolicies([]);
            }
        } catch (e) {
            console.error("Failed to fetch policies");
            setPolicies([]);
        }
    };

    useEffect(() => {
        fetchPolicies();
    }, []);

    // Sync with WebSocket Data
    useEffect(() => {
        if (firewall.policies && firewall.policies.length > 0) {
            setPolicies(firewall.policies);
        }
    }, [firewall.policies]);

    const handleAddPolicy = async () => {
        try {
            const token = localStorage.getItem("sentinel_token");
            if (!token) {
                window.location.href = "/login";
                return;
            }

            const res = await fetch(`${API_URL}/firewall/policies`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify(newPolicy),
            });

            if (res.status === 401) {
                toast.error("Session expired");
                window.location.href = "/login";
                return;
            }

            if (res.ok) {
                toast.success("Policy Created");
                setIsAdding(false);
                fetchPolicies();
            } else {
                toast.error("Failed to create policy");
            }
        } catch (e) {
            toast.error("Error creating policy");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this policy?")) return;
        try {
            const token = localStorage.getItem("sentinel_token");
            if (!token) {
                window.location.href = "/login";
                return;
            }

            const res = await fetch(`${API_URL}/firewall/policies/${id}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });

            if (res.status === 401) {
                toast.error("Session expired");
                window.location.href = "/login";
                return;
            }

            if (res.ok) {
                toast.success("Policy Deleted");
                fetchPolicies();
            }
        } catch (e) {
            toast.error("Error deleting policy");
        }
    };

    return (
        <div className="space-y-6 text-foreground p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Shield className="w-8 h-8 text-primary" />
                        Security Policies (Zero Trust)
                    </h1>
                    <p className="text-muted-foreground">Manage Next-Gen Firewall traffic rules.</p>
                </div>
                <button
                    onClick={() => setIsAdding(true)}
                    className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-primary/90"
                >
                    <Plus className="w-4 h-4" />
                    Add Policy
                </button>
            </div>

            <div className="glass-card rounded-xl border border-white/10 overflow-hidden">
                <div className="grid grid-cols-12 gap-2 p-4 bg-muted/20 font-bold text-sm uppercase tracking-wider text-muted-foreground border-b border-white/10">
                    <div className="col-span-2">Name</div>
                    <div className="col-span-1">Src</div>
                    <div className="col-span-1">Dst</div>
                    <div className="col-span-2">App</div>
                    <div className="col-span-3">Process Identity</div>
                    <div className="col-span-1">Action</div>
                    <div className="col-span-1">Hits</div>
                    <div className="col-span-1"></div>
                </div>

                <div className="divide-y divide-white/10">
                    <AnimatePresence>
                        {isAdding && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="grid grid-cols-12 gap-2 p-4 bg-primary/5 items-center"
                            >
                                <div className="col-span-2">
                                    <input className="bg-transparent border-b border-white/20 w-full focus:outline-none" value={newPolicy.name} onChange={e => setNewPolicy({ ...newPolicy, name: e.target.value })} />
                                </div>
                                <div className="col-span-1">
                                    <select className="bg-transparent border-b border-white/20 w-full text-xs" value={newPolicy.source_zone} onChange={e => setNewPolicy({ ...newPolicy, source_zone: e.target.value })}>
                                        <option value="Any">Any</option>
                                        <option value="Trust">Trust</option>
                                        <option value="Untrust">Untrust</option>
                                    </select>
                                </div>
                                <div className="col-span-1">
                                    <select className="bg-transparent border-b border-white/20 w-full text-xs" value={newPolicy.dest_zone} onChange={e => setNewPolicy({ ...newPolicy, dest_zone: e.target.value })}>
                                        <option value="Any">Any</option>
                                        <option value="Trust">Trust</option>
                                        <option value="Untrust">Untrust</option>
                                        <option value="DMZ">DMZ</option>
                                    </select>
                                </div>
                                <div className="col-span-2">
                                    <input className="bg-transparent border-b border-white/20 w-full" placeholder="App (e.g. ssh)" value={newPolicy.app} onChange={e => setNewPolicy({ ...newPolicy, app: e.target.value })} />
                                </div>
                                <div className="col-span-3">
                                    <input className="bg-transparent border-b border-white/20 w-full text-blue-300" placeholder="Process (e.g. chrome.exe)" value={newPolicy.process_name} onChange={e => setNewPolicy({ ...newPolicy, process_name: e.target.value })} />
                                </div>
                                <div className="col-span-1">
                                    <select className="bg-transparent border-b border-white/20 w-full" value={newPolicy.action} onChange={e => setNewPolicy({ ...newPolicy, action: e.target.value as any })}>
                                        <option value="allow">Allow</option>
                                        <option value="deny">Deny</option>
                                    </select>
                                </div>
                                <div className="col-span-1 text-muted-foreground">-</div>
                                <div className="col-span-1 flex gap-2">
                                    <button onClick={handleAddPolicy} className="p-1 hover:text-green-400"><Save className="w-4 h-4" /></button>
                                    <button onClick={() => setIsAdding(false)} className="p-1 hover:text-red-400"><X className="w-4 h-4" /></button>
                                </div>
                            </motion.div>
                        )}

                        {policies.map((policy) => (
                            <motion.div
                                key={policy.id}
                                layout
                                className="grid grid-cols-12 gap-2 p-4 items-center hover:bg-white/5 transition-colors group"
                            >
                                <div className="col-span-2 font-medium truncate" title={policy.name}>{policy.name}</div>
                                <div className="col-span-1 flex items-center gap-2 text-xs">
                                    <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 truncate">{policy.source_zone}</span>
                                </div>
                                <div className="col-span-1 flex items-center gap-2 text-xs">
                                    <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 truncate">{policy.dest_zone}</span>
                                </div>
                                <div className="col-span-2 text-sm opacity-80 truncate">{policy.app}</div>
                                <div className="col-span-3 text-sm text-blue-200 font-mono truncate" title={policy.process_name || "Any"}>
                                    {policy.process_name || "Any"}
                                </div>
                                <div className="col-span-1">
                                    <span className={cn(
                                        "px-2 py-1 rounded text-xs font-bold uppercase",
                                        policy.action === "allow" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                                    )}>
                                        {policy.action}
                                    </span>
                                </div>
                                <div className="col-span-1 font-mono text-sm opacity-60">{policy.hits}</div>
                                <div className="col-span-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => handleDelete(policy.id)} className="p-2 hover:bg-red-500/20 text-red-400 rounded transition-colors">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};

export default PoliciesPage;
