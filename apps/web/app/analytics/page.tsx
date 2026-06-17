'use client';

import { DashboardShell } from '@/components/layout/shell';
import { PageHeader } from '@/components/ui/page-header';
import { Card, StatCard } from '@/components/ui/card';
import { analyticsData } from '@/lib/mock-data';
import { Download, TrendingUp, IndianRupee, Clock, Zap } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Cell, LineChart, Line,
} from 'recharts';

export default function AnalyticsPage() {
  return (
    <DashboardShell>
      <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
        <PageHeader
          title="Analytics"
          subtitle="Operational metrics, AI performance, and cost savings."
          actions={
            <>
              <select className="input-field !py-2 text-sm w-40">
                <option>Last 7 days</option>
                <option>Last 30 days</option>
                <option>Last quarter</option>
              </select>
              <button className="btn-outline"><Download className="w-4 h-4" /> Export</button>
            </>
          }
        />

        {/* Top stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard label="Manual Hours Saved" value="312h" delta="22%" icon={<Clock className="w-5 h-5" />} accent="royal" />
          <StatCard label="Agency Cost Saved" value="₹4.82L" delta="18%" icon={<IndianRupee className="w-5 h-5" />} accent="pink" />
          <StatCard label="AI Success Rate" value="91.4%" delta="3.2%" icon={<Zap className="w-5 h-5" />} accent="green" />
          <StatCard label="Avg Turnaround" value="2m 14s" delta="32%" deltaPositive icon={<TrendingUp className="w-5 h-5" />} accent="sky" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Volume area chart */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display font-semibold text-lg text-ink-900 dark:text-white">Weekly Processing Volume</h3>
                <p className="text-xs text-ink-500 mt-0.5">Enriched vs failed jobs</p>
              </div>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analyticsData.weeklyVolume}>
                  <defs>
                    <linearGradient id="enrichedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3d5dff" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#3d5dff" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="failedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ed1370" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#ed1370" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(229 231 235)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }} />
                  <Area type="monotone" dataKey="enriched" stroke="#3d5dff" strokeWidth={2.5} fill="url(#enrichedGrad)" />
                  <Area type="monotone" dataKey="failed" stroke="#ed1370" strokeWidth={2.5} fill="url(#failedGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Confidence trend */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display font-semibold text-lg text-ink-900 dark:text-white">AI Confidence Trend</h3>
                <p className="text-xs text-ink-500 mt-0.5">Rolling 6-week average</p>
              </div>
              <span className="pill bg-green-100 text-green-700">↑ 13 pts</span>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analyticsData.confidenceTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(229 231 235)" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[60, 100]} tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }} />
                  <Line type="monotone" dataKey="score" stroke="#ed1370" strokeWidth={3} dot={{ r: 5, fill: '#ed1370' }} activeDot={{ r: 7 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Seller quality scores */}
          <Card className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display font-semibold text-lg text-ink-900 dark:text-white">Seller Quality Scores</h3>
                <p className="text-xs text-ink-500 mt-0.5">Based on data completeness, image quality, and AI confidence</p>
              </div>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analyticsData.sellerQuality} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgb(229 231 235)" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: '#374151' }} axisLine={false} tickLine={false} width={140} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb' }} />
                  <Bar dataKey="score" radius={[0, 8, 8, 0]}>
                    {analyticsData.sellerQuality.map((entry, i) => (
                      <Cell key={i} fill={entry.score >= 90 ? '#22c55e' : entry.score >= 75 ? '#3d5dff' : '#ff5fa6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
