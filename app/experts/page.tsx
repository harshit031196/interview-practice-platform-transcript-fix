'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ExpertCard } from '@/components/ExpertCard'
import { Badge } from '@/components/ui/badge'
import { WingmanHeader } from '@/components/WingmanHeader'
import { Search, Filter, Users } from 'lucide-react'

interface Expert {
  id: string
  name: string
  bio: string
  expertiseTags: string[]
  yearsExp: number
  verified: boolean
  rateCents?: number
  nextSlots: Array<{
    start: Date
    end: Date
  }>
}

export default function ExpertsPage() {
  const [filters, setFilters] = useState({
    search: '',
    tags: '',
    industry: '',
    availability: '',
  })

  const [isLoading, setIsLoading] = useState(true);
  const [experts, setExperts] = useState<Expert[]>([]);

  useEffect(() => {
    const dummyExperts: Expert[] = [
      {
        id: '1',
        name: 'Sarah Chen',
        bio: 'Senior Engineering Manager at Google with over 15 years of experience in distributed systems and technical leadership. Passionate about mentoring the next generation of engineers.',
        expertiseTags: ['System Design', 'Technical Leadership', 'Career Growth'],
        yearsExp: 15,
        verified: true,
        rateCents: 15000,
        nextSlots: [
          { start: new Date(new Date().getTime() + 24 * 60 * 60 * 1000), end: new Date(new Date().getTime() + 25 * 60 * 60 * 1000) },
          { start: new Date(new Date().getTime() + 48 * 60 * 60 * 1000), end: new Date(new Date().getTime() + 49 * 60 * 60 * 1000) },
        ],
      },
      {
        id: '2',
        name: 'Michael Rodriguez',
        bio: 'Principal Product Manager at Amazon, specializing in consumer-facing products and product strategy. Expert in A/B testing and data-driven decision making.',
        expertiseTags: ['Product Strategy', 'Data Analysis', 'User Research'],
        yearsExp: 12,
        verified: true,
        rateCents: 18000,
        nextSlots: [
          { start: new Date(new Date().getTime() + 2 * 24 * 60 * 60 * 1000), end: new Date(new Date().getTime() + 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000) },
        ],
      },
      {
        id: '3',
        name: 'Emily White',
        bio: 'Staff Software Engineer at Meta, focused on scalability and performance of large-scale social media platforms. Core contributor to several open-source projects.',
        expertiseTags: ['Scalability', 'Performance Engineering', 'React'],
        yearsExp: 8,
        verified: true,
        rateCents: 12000,
        nextSlots: [],
      },
       {
        id: '4',
        name: 'David Lee',
        bio: 'Director of Product Design at Netflix. Leads a team of designers creating intuitive and beautiful user experiences for millions of users worldwide.',
        expertiseTags: ['Product Design', 'UI/UX', 'Design Systems'],
        yearsExp: 14,
        verified: true,
        rateCents: 17000,
        nextSlots: [
          { start: new Date(new Date().getTime() + 3 * 24 * 60 * 60 * 1000), end: new Date(new Date().getTime() + 3 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000) },
        ],
      },
      {
        id: '5',
        name: 'Jessica Brown',
        bio: 'AI Research Scientist at DeepMind. Her work focuses on large language models and their applications in creative industries. PhD in Computer Science from Stanford.',
        expertiseTags: ['Machine Learning', 'AI Ethics', 'NLP'],
        yearsExp: 7,
        verified: false,
        nextSlots: [
           { start: new Date(new Date().getTime() + 5 * 24 * 60 * 60 * 1000), end: new Date(new Date().getTime() + 5 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000) },
        ],
      },
       {
        id: '6',
        name: 'Daniel Green',
        bio: 'Cybersecurity consultant with a background in ethical hacking and penetration testing. Helps Fortune 500 companies secure their digital assets.',
        expertiseTags: ['Cybersecurity', 'Penetration Testing', 'Cloud Security'],
        yearsExp: 10,
        verified: true,
        rateCents: 16000,
        nextSlots: [],
      },
    ];

    setTimeout(() => {
      // Force no availability for all experts per requirement
      const normalized = dummyExperts.map(e => ({ ...e, nextSlots: [] as Expert['nextSlots'] }))
      setExperts(normalized);
      setIsLoading(false);
    }, 1000);
  }, []);

  const filteredExperts = (experts || []).filter(expert => {
    const q = filters.search.toLowerCase();
    const matchesSearch = !q ||
      expert.name.toLowerCase().includes(q) ||
      expert.bio.toLowerCase().includes(q) ||
      expert.expertiseTags.some(tag => tag.toLowerCase().includes(q));
    const matchesTag = !filters.tags || expert.expertiseTags.some(tag => tag.toLowerCase() === filters.tags.toLowerCase());
    return matchesSearch && matchesTag;
  })

  const handleBookExpert = (expertId: string) => {
    // Navigate to expert detail page
    window.location.href = `/experts/${expertId}`
  }

  const popularTags = [
    'System Design', 'Product Strategy', 'Technical Leadership', 'Data Analysis',
    'User Research', 'Engineering Management', 'Scalability', 'Product Design'
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <WingmanHeader
        title="Expert Interviewers"
        subtitle="Book sessions with industry professionals"
        showBackButton={true}
        backHref="/dashboard"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        <div className="mb-6 text-center">
          <p className="text-lg text-muted-foreground">
            {filteredExperts.length} experts available
          </p>
        </div>

        {/* Filters */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Filter className="w-6 h-6" />
              Find Your Perfect Interviewer
            </CardTitle>
            <CardDescription className="text-lg">
              Filter by expertise, experience, and availability
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or expertise..."
                    value={filters.search}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Industry</label>
                <Select
                  value={filters.industry}
                  onValueChange={(value) => setFilters({ ...filters, industry: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any industry" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any industry</SelectItem>
                    <SelectItem value="Technology">Technology</SelectItem>
                    <SelectItem value="Finance">Finance</SelectItem>
                    <SelectItem value="Healthcare">Healthcare</SelectItem>
                    <SelectItem value="Consulting">Consulting</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Experience</label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Any experience" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any experience</SelectItem>
                    <SelectItem value="5">5+ years</SelectItem>
                    <SelectItem value="10">10+ years</SelectItem>
                    <SelectItem value="15">15+ years</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Availability</label>
                <Select
                  value={filters.availability}
                  onValueChange={(value) => setFilters({ ...filters, availability: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Any time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="tomorrow">Tomorrow</SelectItem>
                    <SelectItem value="week">This week</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Popular Tags */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Popular Expertise</label>
              <div className="flex flex-wrap gap-2">
                {popularTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant={filters.tags === tag ? "default" : "secondary"}
                    className="cursor-pointer"
                    onClick={() => setFilters({ 
                      ...filters, 
                      tags: filters.tags === tag ? '' : tag 
                    })}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="h-80 animate-pulse">
                <CardHeader>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="h-3 bg-gray-200 rounded"></div>
                    <div className="h-3 bg-gray-200 rounded w-5/6"></div>
                    <div className="flex gap-2">
                      <div className="h-6 bg-gray-200 rounded w-16"></div>
                      <div className="h-6 bg-gray-200 rounded w-20"></div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredExperts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredExperts.map((expert) => (
              <ExpertCard
                key={expert.id}
                expert={expert}
                onBook={handleBookExpert}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="text-center py-12">
              <Users className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-medium mb-2">No experts found</h3>
              <p className="text-muted-foreground mb-4">
                Try adjusting your filters or search terms
              </p>
              <Button 
                onClick={() => setFilters({ search: '', tags: '', industry: '', availability: '' })}
                variant="outline"
              >
                Clear Filters
              </Button>
            </CardContent>
          </Card>
        )}

        {/* CTA Section */}
        <Card className="mt-12 bg-primary text-primary-foreground">
          <CardContent className="text-center py-8">
            <h2 className="text-2xl font-bold mb-4">Want to become an expert interviewer?</h2>
            <p className="text-primary-foreground/80 mb-6 max-w-2xl mx-auto">
              Share your expertise, help others succeed, and earn money by conducting mock interviews.
            </p>
            <Button variant="secondary" size="lg">
              Apply to be an Interviewer
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
