git reset HEAD~1
rm ./backport.sh
git cherry-pick 6c65769bc518bbabeae387e837ca5a0ad52b7af5
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
