import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // Clean up existing data
  await prisma.transcriptItem.deleteMany()
  await prisma.recording.deleteMany()
  await prisma.report.deleteMany()
  await prisma.booking.deleteMany()
  await prisma.interviewSession.deleteMany()
  await prisma.jD.deleteMany()
  await prisma.availabilitySlot.deleteMany()
  await prisma.message.deleteMany()
  await prisma.peerMatchOptIn.deleteMany()
  await prisma.intervieweeProfile.deleteMany()
  await prisma.interviewerProfile.deleteMany()
  await prisma.contentItem.deleteMany()
  await prisma.account.deleteMany()
  await prisma.user.deleteMany()

  // Create users
  const hashedPassword = await bcrypt.hash('password123', 12)

  // Interviewee 1 - PM
  const interviewee1 = await prisma.user.create({
    data: {
      email: 'pm.candidate@example.com',
      passwordHash: hashedPassword,
      name: 'Sarah Chen',
      role: 'INTERVIEWEE',
      linkedinUrl: 'https://linkedin.com/in/sarahchen',
      intervieweeProfile: {
        create: {
          currentRole: 'Senior Product Manager',
          yearsExp: 5,
          industry: 'Technology',
          skills: [
            { name: 'Product Strategy', self: 4 },
            { name: 'Data Analysis', self: 4 },
            { name: 'User Research', self: 3 },
            { name: 'Stakeholder Management', self: 5 },
            { name: 'Technical Understanding', self: 3 }
          ],
          targetRoles: ['VP of Product', 'Director of Product', 'Principal PM'],
          credits: 85,
          readinessScore: 72
        }
      }
    }
  })

  // Interviewee 2 - SWE
  const interviewee2 = await prisma.user.create({
    data: {
      email: 'swe.candidate@example.com',
      passwordHash: hashedPassword,
      name: 'Alex Rodriguez',
      role: 'INTERVIEWEE',
      linkedinUrl: 'https://linkedin.com/in/alexrodriguez',
      intervieweeProfile: {
        create: {
          currentRole: 'Software Engineer',
          yearsExp: 3,
          industry: 'Technology',
          skills: [
            { name: 'JavaScript/TypeScript', self: 4 },
            { name: 'React/Next.js', self: 4 },
            { name: 'Node.js', self: 3 },
            { name: 'System Design', self: 2 },
            { name: 'Algorithms', self: 3 }
          ],
          targetRoles: ['Senior Software Engineer', 'Tech Lead', 'Staff Engineer'],
          credits: 120,
          readinessScore: 58
        }
      }
    }
  })

  // Interviewer 1 - Verified
  const interviewer1 = await prisma.user.create({
    data: {
      email: 'expert1@example.com',
      passwordHash: hashedPassword,
      name: 'Michael Thompson',
      role: 'INTERVIEWER',
      linkedinUrl: 'https://linkedin.com/in/michaelthompson',
      interviewerProfile: {
        create: {
          bio: 'Former VP of Engineering at Google with 15+ years experience. Specialized in system design and technical leadership interviews.',
          expertiseTags: ['System Design', 'Technical Leadership', 'Engineering Management', 'Scalability'],
          yearsExp: 15,
          verified: true,
          verificationStatus: 'VERIFIED',
          calendarProvider: 'GOOGLE',
          rateCents: 15000 // $150/hour
        }
      }
    },
    include: {
      interviewerProfile: true
    }
  })

  // Interviewer 2 - Pending verification
  const interviewer2 = await prisma.user.create({
    data: {
      email: 'expert2@example.com',
      passwordHash: hashedPassword,
      name: 'Lisa Wang',
      role: 'INTERVIEWER',
      linkedinUrl: 'https://linkedin.com/in/lisawang',
      interviewerProfile: {
        create: {
          bio: 'Senior Product Manager at Meta with expertise in product strategy and user research. Passionate about helping PMs excel.',
          expertiseTags: ['Product Strategy', 'User Research', 'Data Analysis', 'Product Design'],
          yearsExp: 8,
          verified: false,
          verificationStatus: 'PENDING',
          calendarProvider: 'MICROSOFT',
          rateCents: 12000 // $120/hour
        }
      }
    },
    include: {
      interviewerProfile: true
    }
  })

  // Create availability slots for interviewers
  const now = new Date()
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const dayAfterTomorrow = new Date(now.getTime() + 48 * 60 * 60 * 1000)

  await prisma.availabilitySlot.createMany({
    data: [
      // Interviewer 1 availability
      {
        interviewerId: interviewer1.interviewerProfile!.id,
        start: new Date(tomorrow.setHours(10, 0, 0, 0)),
        end: new Date(tomorrow.setHours(11, 0, 0, 0)),
        isRecurring: false
      },
      {
        interviewerId: interviewer1.interviewerProfile!.id,
        start: new Date(tomorrow.setHours(14, 0, 0, 0)),
        end: new Date(tomorrow.setHours(15, 0, 0, 0)),
        isRecurring: false
      },
      {
        interviewerId: interviewer1.interviewerProfile!.id,
        start: new Date(dayAfterTomorrow.setHours(9, 0, 0, 0)),
        end: new Date(dayAfterTomorrow.setHours(10, 0, 0, 0)),
        isRecurring: false
      },
      // Interviewer 2 availability
      {
        interviewerId: interviewer2.interviewerProfile!.id,
        start: new Date(tomorrow.setHours(13, 0, 0, 0)),
        end: new Date(tomorrow.setHours(14, 0, 0, 0)),
        isRecurring: false
      },
      {
        interviewerId: interviewer2.interviewerProfile!.id,
        start: new Date(dayAfterTomorrow.setHours(11, 0, 0, 0)),
        end: new Date(dayAfterTomorrow.setHours(12, 0, 0, 0)),
        isRecurring: false
      }
    ]
  })

  // Create Job Descriptions
  const pmJD = await prisma.jD.create({
    data: {
      userId: interviewee1.id,
      title: 'Senior Product Manager - AI Platform',
      rawText: `We are seeking a Senior Product Manager to lead our AI Platform initiatives. You will be responsible for defining product strategy, working with engineering teams, and driving user adoption.

Key Responsibilities:
- Define and execute product roadmap for AI/ML features
- Collaborate with engineering, design, and data science teams
- Conduct user research and analyze product metrics
- Work with stakeholders across the organization
- Drive go-to-market strategies for new features

Requirements:
- 5+ years of product management experience
- Strong analytical and data-driven decision making
- Experience with AI/ML products preferred
- Excellent communication and leadership skills
- Technical background with ability to work closely with engineers`,
      keywords: ['Product Management', 'AI/ML', 'Strategy', 'Analytics', 'Leadership', 'Technical', 'User Research', 'Go-to-Market']
    }
  })

  const sweJD = await prisma.jD.create({
    data: {
      userId: interviewee2.id,
      title: 'Senior Software Engineer - Full Stack',
      rawText: `Join our engineering team as a Senior Software Engineer working on our core platform. You'll build scalable web applications and contribute to architectural decisions.

Key Responsibilities:
- Design and implement scalable web applications
- Work with React, Node.js, and cloud technologies
- Participate in system design and architecture discussions
- Mentor junior engineers and conduct code reviews
- Collaborate with product and design teams

Requirements:
- 5+ years of software engineering experience
- Strong proficiency in JavaScript/TypeScript, React, Node.js
- Experience with cloud platforms (AWS, GCP, or Azure)
- Understanding of system design principles
- Experience with databases and API design
- Strong problem-solving and communication skills`,
      keywords: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'System Design', 'Cloud', 'APIs', 'Databases', 'Full Stack']
    }
  })

  // Create Interview Sessions
  const completedAISession = await prisma.interviewSession.create({
    data: {
      type: 'AI',
      status: 'COMPLETED',
      intervieweeId: interviewee1.id,
      jdId: pmJD.id,
      startedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
      endedAt: new Date(now.getTime() - 1.5 * 60 * 60 * 1000) // 1.5 hours ago
    }
  })

  const scheduledHumanSession = await prisma.interviewSession.create({
    data: {
      type: 'HUMAN',
      status: 'SCHEDULED',
      intervieweeId: interviewee2.id,
      interviewerId: interviewer1.id,
      jdId: sweJD.id,
      startedAt: new Date(tomorrow.setHours(10, 0, 0, 0))
    }
  })

  const scheduledPeerSession = await prisma.interviewSession.create({
    data: {
      type: 'PEER',
      status: 'SCHEDULED',
      intervieweeId: interviewee1.id,
      startedAt: new Date(dayAfterTomorrow.setHours(15, 0, 0, 0))
    }
  })

  // Create booking for human session
  await prisma.booking.create({
    data: {
      interviewerId: interviewer1.id,
      intervieweeId: interviewee2.id,
      sessionId: scheduledHumanSession.id,
      start: new Date(tomorrow.setHours(10, 0, 0, 0)),
      end: new Date(tomorrow.setHours(11, 0, 0, 0)),
      notes: 'System design interview focusing on scalable web applications',
      status: 'CONFIRMED'
    }
  })

  // Create report for completed session
  const report = await prisma.report.create({
    data: {
      sessionId: completedAISession.id,
      overall: 72,
      jdCoverage: 'MEDIUM',
      strengths: [
        'Strong strategic thinking and product vision',
        'Good understanding of AI/ML concepts',
        'Clear communication of complex ideas'
      ],
      improvements: [
        'Could improve technical depth in ML discussions',
        'Need more specific examples of stakeholder management',
        'Should practice quantifying impact with metrics'
      ],
      actions: [
        { label: 'Read: Building ML Products', url: 'https://example.com/ml-products', type: 'article' },
        { label: 'Practice: Stakeholder Scenarios', url: 'https://example.com/stakeholder-practice', type: 'exercise' },
        { label: 'Watch: Product Metrics Deep Dive', url: 'https://example.com/metrics-video', type: 'video' }
      ],
      charts: {
        radar: {
          communication: 85,
          problemSolving: 70,
          confidence: 75,
          jdRelevance: 65,
          technicalDepth: 60,
          leadership: 80
        },
        pace: [
          { time: 0, wpm: 120, confidence: 0.8 },
          { time: 300, wpm: 135, confidence: 0.85 },
          { time: 600, wpm: 110, confidence: 0.75 },
          { time: 900, wpm: 125, confidence: 0.9 }
        ],
        sentiment: {
          positive: 65,
          neutral: 25,
          negative: 10
        }
      }
    }
  })

  // Create transcript items for completed session
  await prisma.transcriptItem.createMany({
    data: [
      {
        sessionId: completedAISession.id,
        t: 0,
        speaker: 'AI',
        text: 'Hello! I\'m excited to conduct your product management interview today. Let\'s start with a product strategy question.',
        labels: []
      },
      {
        sessionId: completedAISession.id,
        t: 15,
        speaker: 'HUMAN',
        text: 'Great, I\'m ready to begin. Thank you for this opportunity.',
        labels: ['clear']
      },
      {
        sessionId: completedAISession.id,
        t: 25,
        speaker: 'AI',
        text: 'Imagine you\'re the PM for our AI platform. How would you prioritize features for the next quarter?',
        labels: []
      },
      {
        sessionId: completedAISession.id,
        t: 35,
        speaker: 'HUMAN',
        text: 'Well, um, I would start by, you know, looking at user feedback and, uh, market research to understand what features would provide the most value.',
        labels: ['filler', 'verbose']
      },
      {
        sessionId: completedAISession.id,
        t: 55,
        speaker: 'HUMAN',
        text: 'I\'d use a framework like RICE scoring to evaluate potential features based on reach, impact, confidence, and effort.',
        labels: ['clear', 'structured']
      }
    ]
  })

  // Create recording for completed session
  await prisma.recording.create({
    data: {
      sessionId: completedAISession.id,
      url: 'https://example.com/recordings/demo-session-1.mp4',
      durationSec: 900, // 15 minutes
      consent: true
    }
  })

  // Create content items for library
  await prisma.contentItem.createMany({
    data: [
      {
        title: 'Product Management Interview Guide',
        url: 'https://example.com/pm-guide',
        tags: ['Product Management', 'Interview Prep', 'Strategy']
      },
      {
        title: 'System Design Interview Patterns',
        url: 'https://example.com/system-design',
        tags: ['System Design', 'Engineering', 'Scalability']
      },
      {
        title: 'Behavioral Interview Framework',
        url: 'https://example.com/behavioral',
        tags: ['Behavioral', 'STAR Method', 'Leadership']
      },
      {
        title: 'Technical Communication Best Practices',
        url: 'https://example.com/tech-communication',
        tags: ['Communication', 'Technical', 'Presentation']
      },
      {
        title: 'Salary Negotiation Strategies',
        url: 'https://example.com/negotiation',
        tags: ['Negotiation', 'Salary', 'Career']
      }
    ]
  })

  // Create peer match opt-ins
  await prisma.peerMatchOptIn.createMany({
    data: [
      {
        userId: interviewee1.id,
        active: true,
        role: 'Product Manager',
        timezone: 'America/Los_Angeles'
      },
      {
        userId: interviewee2.id,
        active: true,
        role: 'Software Engineer',
        timezone: 'America/New_York'
      }
    ]
  })

  // Create sample messages
  await prisma.message.createMany({
    data: [
      {
        fromUserId: interviewee2.id,
        toUserId: interviewer1.id,
        text: 'Hi Michael, thank you for accepting my booking. I\'m looking forward to our system design interview tomorrow!'
      },
      {
        fromUserId: interviewer1.id,
        toUserId: interviewee2.id,
        text: 'Hi Alex! I\'m excited to work with you. I\'ve reviewed your background and we\'ll have a great session. See you tomorrow at 10 AM!'
      }
    ]
  })

  console.log('Seed data created successfully!')
  console.log('Users created:')
  console.log('- Interviewee (PM):', interviewee1.email)
  console.log('- Interviewee (SWE):', interviewee2.email)
  console.log('- Interviewer (Verified):', interviewer1.email)
  console.log('- Interviewer (Pending):', interviewer2.email)
  console.log('Password for all users: password123')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
