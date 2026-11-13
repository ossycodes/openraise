import { apiAs } from '../../_lib/api';
import { OperationForm } from '../_components/operation-form';
export const metadata = { title: 'Categories' };
export default async function Categories() {
  const categories = await apiAs<
    {
      slug: string;
      name: string;
      description: string;
      sortOrder: number;
      updatedAt: string;
    }[]
  >('/admin/categories', { returnTo: '/admin/categories' });
  return (
    <>
      <div className="review-title">
        <div>
          <div className="section-eyebrow">Discovery</div>
          <h1>Categories</h1>
          <p>
            Keep causes easy to find. Lower sort positions appear first;
            existing category links stay the same.
          </p>
        </div>
      </div>
      <div className="admin-operation-grid">
        <OperationForm
          key={categories.length}
          path="categories"
          title="Add a category"
          fields={[
            { name: 'slug', label: 'URL name, for example community-projects' },
            { name: 'name', label: 'Name' },
            { name: 'description', label: 'Description', type: 'textarea' },
            {
              name: 'sortOrder',
              label: 'Sort position',
              type: 'number',
              value: 0,
            },
          ]}
          submitLabel="Create category"
        />
        {categories.map((c) => (
          <OperationForm
            key={`${c.slug}-${c.updatedAt}`}
            title={c.name}
            description={`Discovery filter: /?category=${c.slug}`}
            path={`categories/${c.slug}`}
            fixed={{ expectedUpdatedAt: c.updatedAt }}
            fields={[
              { name: 'name', label: 'Name', value: c.name },
              {
                name: 'description',
                label: 'Description',
                type: 'textarea',
                value: c.description,
              },
              {
                name: 'sortOrder',
                label: 'Sort position',
                type: 'number',
                value: c.sortOrder,
              },
            ]}
          />
        ))}
      </div>
    </>
  );
}
