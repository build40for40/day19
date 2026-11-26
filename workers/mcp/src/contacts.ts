import type { Contact } from './contract'

/** Where contacts come from and get deleted. Google Contacts (the People API) will implement this once sign-in exists. */
export interface ContactSource {
  list(): Promise<Contact[]>
  remove(id: string): Promise<void>
  /** Puts back someone `remove` deleted. Returns them as they are now: Google gives a restored contact a new id. */
  restore(contact: Contact): Promise<Contact>
}

const fake = (id: string, name: string, organisation = '', email = true, phone?: string): Contact => ({
  id,
  name,
  emails: email ? [`${name.split(' ')[0]!.toLowerCase()}@example.com`] : [],
  phones: phone ? [phone] : [],
  photoUrl: null,
  organisation,
})

/** Made-up people for the demo and the widget's fake mode. Emails are example.com, never real ones. */
export const DEMO_CONTACTS: Contact[] = [
  fake('c01', 'Agnes Okafor', 'Example School'),
  fake('c02', 'Bao Tran', 'Example Print Shop'),
  fake('c03', 'Check Credit', '', false),
  fake('c04', 'Dave Plumber', '', false),
  fake('c05', 'Esme Hartley', 'Example Choir'),
  fake('c06', 'Farid Rahimi', 'Example University'),
  fake('c07', 'Gym Induction', '', false),
  fake('c08', 'Hana Sato'),
  fake('c09', 'Ivo Marsh', 'Example Lettings'),
  fake('c10', 'Jo Skype', '', false),
  fake('c11', 'Kwame Boateng', 'Example FC'),
  fake('c12', 'Lena Fischer', 'Example Conference'),
]
