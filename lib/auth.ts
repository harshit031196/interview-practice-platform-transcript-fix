import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import crypto from 'crypto'
import { PrismaAdapter } from '@auth/prisma-adapter'

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  adapter: PrismaAdapter(prisma as any),
  logger: {
    error: (code, metadata) => {
      console.error(`NextAuth Error: ${code}`, metadata);
    },
    warn: (code) => {
      console.warn(`NextAuth Warning: ${code}`);
    },
    debug: (code, metadata) => {
      console.log(`NextAuth Debug: ${code}`, metadata);
    },
  },
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
          return null;
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email: credentials.email }
          });

          if (!user) {
            console.log('❌ User not found:', credentials.email);
            return null;
          }

          const isValidPassword = await bcrypt.compare(credentials.password, user.passwordHash || '');
          
          if (!isValidPassword) {
            console.log('❌ Invalid password for user:', credentials.email);
            return null;
          }

          console.log('✅ User authenticated successfully:', user.email);
          
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          };
        } catch (error) {
          console.error('❌ Database error during authentication:', error);
          return null;
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
  debug: true,
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-next-auth.session-token'
        : 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  callbacks: {
    async jwt({ token, user, account }) {
      console.log('🔍 JWT callback called with:', { 
        hasUser: !!user,
        hasAccount: !!account,
        tokenSub: token?.sub
      });
      
      // When signing in
      if (user) {
        // Add user data to token
        token.userId = user.id;
        token.email = user.email;
        token.name = user.name;
        token.role = user.role;
        
        console.log('✅ Added user data to JWT token:', { userId: token.userId, email: token.email });
        
        // Create or update database session for API authentication
        if (account?.provider === 'credentials') {
          try {
            const sessionToken = crypto.randomBytes(32).toString('hex');
            const expires = new Date();
            expires.setDate(expires.getDate() + 30);
            
            console.log('🔧 Creating database session linked to JWT for user:', user.id);
            
            // Create database session linked to JWT
            const newSession = await prisma.session.create({
              data: {
                sessionToken,
                userId: user.id,
                expires,
                // Store JWT token ID for linking
                jwtTokenId: typeof (token as any).jti === 'string' ? ((token as any).jti as string) : null,
              },
            });
            
            console.log('✅ Created database session with ID:', newSession.id);
            
            // Store session token in JWT for verification
            token.dbSessionToken = sessionToken;
            token.dbSessionExpires = expires;
            
            console.log('🔧 Added database session token to JWT');
          } catch (error) {
            console.error('❌ Error creating database session:', error);
          }
        }
      }
      
      return token;
    },
    
    async signIn({ user, account, profile, credentials }) {
      // Make sure user.id is set from the database user
      console.log('🔍 SignIn callback called with:', { 
        user: user ? { id: user.id, email: user.email } : null,
        accountProvider: account?.provider,
        hasCredentials: !!credentials
      });
      
      return true;
    },
    async session({ session, token }) {
      console.log('🔍 Session callback called with:', { 
        hasToken: !!token,
        tokenUserId: token?.sub,
        tokenEmail: token?.email
      });
      
      // For JWT sessions, token object should be available
      if (token) {
        console.log('🔍 JWT session strategy: Token object available');
        
        // Add user info from token to session
        session.user = {
          ...session.user,
          id: token.userId as string || token.sub || '',
          email: token.email as string,
          name: token.name as string,
          role: token.role as string || 'user',
        };
        
        // Add database session token for API calls
        if (token.dbSessionToken) {
          console.log('🔧 Adding database session token to session object for API calls');
          (session as any).dbSessionToken = token.dbSessionToken;
        } else {
          // Check if a database session exists for this user
          try {
            const userId = token.userId || token.sub;
            if (userId) {
              const dbSessions = await prisma.session.findMany({
                where: { userId: userId as string },
                orderBy: { expires: 'desc' },
                take: 1
              });
              
              console.log(`🔍 Found ${dbSessions.length} database sessions for user ${userId}`);
              if (dbSessions.length > 0) {
                console.log('🔍 Most recent session expires:', dbSessions[0].expires);
                
                // Add the session token to the session object for API calls
                const sessionToken = dbSessions[0].sessionToken;
                (session as any).dbSessionToken = sessionToken;
                console.log('🔧 Added existing database session token to session object');
              } else {
                console.log('⚠️ No database sessions found for user');
              }
            }
          } catch (error) {
            console.error('❌ Error checking database sessions:', error);
          }
        }
      }
      
      return session;
    },
    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      // Allows callback URLs on the same origin
      else if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
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

