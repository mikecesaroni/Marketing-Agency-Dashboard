import { Link, useParams } from 'react-router-dom'
import Layout from '../components/Layout'
import CourseView from '../components/training/CourseView'
import ModulePlayer from '../components/training/ModulePlayer'
import QuizRunner from '../components/training/QuizRunner'
import TrainingHome from '../components/training/TrainingHome'
import { Card } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { isAdmin } from '../lib/access'
import { COURSES, findCourse } from '../lib/training/courses'
import { useTraining } from '../lib/training/useTraining'

/**
 * Training: how a new hire learns Meta, Google and Field Services the way we
 * run them, and where everybody looks a rule up afterwards.
 *
 * Three addresses, one page:
 *   /training                    the courses, your place in each, the search
 *   /training/:courseId          one course's modules and its quiz
 *   /training/:courseId/:moduleId  one module, or the quiz when it is "quiz"
 *
 * The courses are data (src/lib/training), progress is a row per person per
 * module saved as they go (training_progress), and quiz attempts are kept in
 * quiz_attempts. Nothing here is specific to one course.
 */
export default function TrainingPage() {
  const { courseId, moduleId } = useParams()
  const { role } = useAuth()
  const admin = isAdmin(role)
  const training = useTraining()

  const course = courseId ? findCourse(courseId) : null
  const mod = course && moduleId && moduleId !== 'quiz' ? course.modules.find((m) => m.id === moduleId) || null : null
  const missing = (courseId && !course) || (moduleId && moduleId !== 'quiz' && !mod)

  let body
  if (training.loading) body = <p className="text-slate-500">Loading…</p>
  else if (missing)
    body = (
      <Card className="text-sm text-slate-700">
        That part of Training does not exist.{' '}
        <Link to="/training" className="text-blue-600 underline underline-offset-2">
          Back to Training
        </Link>
      </Card>
    )
  else if (course && moduleId === 'quiz') body = <QuizRunner key={course.id} course={course} training={training} admin={admin} />
  else if (course && mod) body = <ModulePlayer key={`${course.id}/${mod.id}`} course={course} mod={mod} training={training} />
  else if (course) body = <CourseView course={course} training={training} />
  else body = <TrainingHome courses={COURSES} training={training} admin={admin} />

  return (
    <Layout title="Training" subtitle="Learn how we run Meta, Google and Field Services, then look it up later">
      {training.error && (
        <Card tone="danger" className="mb-4 text-sm text-red-700">
          Could not load your progress: {training.error}
        </Card>
      )}
      {body}
    </Layout>
  )
}
