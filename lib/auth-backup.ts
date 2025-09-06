import NextAuth, { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'


export const authOptions: NextAuthOptions = {
  debug: true,
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        console.log('🔍 Authorize function called with:', { email: credentials?.email });
        
        if (!credentials?.email || !credentials?.password) {
          console.log('❌ Missing credentials');
          return null
        }

        try {
          const user = await prisma.user.findUnique({
            where: {
              email: credentials.email
            }
          })

          if (!user || !user.passwordHash) {
            console.log('❌ User not found or no password hash');
            return null
          }

          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            user.passwordHash
          )

          if (!isPasswordValid) {
            console.log('❌ Invalid password');
            return null
          }

          console.log('✅ User authenticated successfully:', user.email);
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          }
        } catch (error) {
          console.error('❌ Authorize function error:', error);
          return null
        }
      }
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },
  callbacks: {
    async jwt({ token, user }) {
      console.log('🔍 JWT callback called:', { user: user?.email, token: token?.email });
      if (user) {
        token.role = user.role
        token.name = user.name
        token.email = user.email
      }
      return token
    },
    async session({ session, token }) {
      console.log('🔍 Session callback called:', { token: token?.email });
      if (token) {
        session.user.id = token.sub!
        session.user.role = token.role as string
        session.user.name = token.name as string || ''
        session.user.email = token.email as string
      }
      return session
    },
    async signIn({ user, account }) {
      console.log('🔍 SignIn callback called:', { user: user?.email, provider: account?.provider });
      // For OAuth providers, create user profile if it doesn't exist
      if (account?.provider !== 'credentials' && user.email) {
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email }
        })

        if (!existingUser) {
          // Create new user with default role
          await prisma.user.create({
            data: {
              email: user.email,
              name: user.name || '',
              role: 'INTERVIEWEE', // Default role
            }
          })
        }
      }
      return true
    }
  },
  pages: {
    signIn: '/auth/signin',
  }
}

declare module 'next-auth' {
  interface User {
    role?: string
  }
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: string
    }
  }
}
