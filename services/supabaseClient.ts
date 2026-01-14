
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://krvelczokdqcqqtzhcgg.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtydmVsY3pva2RxY3FxdHpoY2dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzOTkwMDQsImV4cCI6MjA4Mzk3NTAwNH0.n0TN6E5-J_RexSVxWQ-OAIR1MWxxNEWlBw7b--68yt8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
